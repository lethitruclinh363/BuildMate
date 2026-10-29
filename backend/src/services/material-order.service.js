
const { MaterialOrder, cancelOrderAtomic } = require('../repositories/materialOrderAccess');
const { Store } = require('../repositories/partnerAccess');
const { db } = require('../repositories/pgContext');
const { ApiError } = require('../utils/ApiError');
const { requirePlace } = require('../utils/geo');
const locationCorrection = require('./locationCorrection.service');
const checkoutService = require('./material-checkout.service');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { emitToUser } = require('./socketService');

const {
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  STORE_CANCELLABLE_STATUSES,
  priceMaterialOrder,
  assertMaterialStatusTransition,
  summarizeMaterialEarnings,
  materialStatusNotice,
  storeCancelNotice,
} = require('../utils/material-order.rules');

const REPLAY_WINDOW_MS = 45 * 1000;
const replayLocks = new Map();
const orderLocks = new Map();

function itemsKey(items = []) {
  const merged = new Map();

  for (const item of items || []) {
    const id = String(item.materialId || '');
    if (!id) continue;

    merged.set(
      id,
      (merged.get(id) || 0) + Number(item.quantity || 0),
    );
  }

  return [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join('|');
}

function replayFingerprint(userId, body = {}) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  const pin =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(5)},${lng.toFixed(5)}`
      : '';

  return [
    String(userId),
    String(body.storeId || ''),
    itemsKey(body.items),
    String(body.deliveryAddress || '').trim().toLowerCase(),
    pin,
    String(body.customerNote || '').trim(),
  ].join('|');
}

function isReplayOf(row, body, now = Date.now()) {
  if (!row?.createdAt) return false;

  if (now - new Date(row.createdAt).getTime() > REPLAY_WINDOW_MS) {
    return false;
  }

  if (String(row.storeId) !== String(body.storeId)) {
    return false;
  }

  if (
    String(row.deliveryAddress || '').trim() !==
    String(body.deliveryAddress || '').trim()
  ) {
    return false;
  }

  return itemsKey(row.items) === itemsKey(body.items);
}

async function withReplayLock(key, work) {
  const pending = replayLocks.get(key);
  if (pending) return pending;

  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      replayLocks.delete(key);
    });

  replayLocks.set(key, next);
  return next;
}

async function withOrderLock(orderId, work) {
  const key = `status:${String(orderId)}`;
  const pending = orderLocks.get(key);

  if (pending) return pending;

  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      orderLocks.delete(key);
    });

  orderLocks.set(key, next);
  return next;
}

function rejectQuote(summary) {
  if (summary.code === 'DELIVERY_DISABLED') {
    throw new ApiError(409, 'This store does not offer delivery', {
      code: summary.code,
    });
  }

  if (summary.code === 'OUT_OF_RANGE') {
    throw new ApiError(
      409,
      'Store delivers only within its service radius',
      {
        code: summary.code,
        serviceRadiusKm: summary.serviceRadiusKm,
      },
    );
  }

  if (summary.code === 'BELOW_MINIMUM') {
    throw new ApiError(409, 'Order is below the minimum amount', {
      code: summary.code,
      minimumOrderAmount: summary.minimumOrderAmount,
    });
  }

  throw new ApiError(409, 'This order cannot be delivered', {
    code: summary.code,
  });
}

async function create(user, body) {
  return withReplayLock(
    replayFingerprint(user.id, body),
    () => placeOrder(user, body),
  );
}

async function placeOrder(user, body) {
  const recent = await MaterialOrder.find({
    customerId: user.id,
    storeId: body.storeId,
  })
    .sort({ createdAt: -1 })
    .limit(5);

  const replayed = recent.find((row) => isReplayOf(row, body));
  if (replayed) return replayed.toPublic();

  const prepared = await checkoutService.prepare(
    {
      storeId: body.storeId,
      address: body.deliveryAddress,
      lat: body.lat,
      lng: body.lng,
      items: body.items,
    },
    { requireLive: true },
  );

  if (!prepared.summary.ok) {
    rejectQuote(prepared.summary);
  }

  const priced = priceMaterialOrder(prepared.summary);

  if (!priced.ok) {
    throw new ApiError(
      422,
      'Deposit does not cover the platform fee',
      { code: priced.code },
    );
  }

  const delivery = requirePlace(
    {
      lat: body.lat,
      lng: body.lng,
      address: body.deliveryAddress,
      label: body.deliveryAddress,
    },
    {
      addressMax: 240,
      labelMax: 240,
    },
  );

  if (!delivery) {
    throw new ApiError(422, 'Coordinates are invalid');
  }

  if (!locationCorrection.confirmedFlag(body.locationConfirmed)) {
    throw new ApiError(422, 'Confirm the delivery location');
  }

  const confirmedAt = new Date();

  const order = await MaterialOrder.create({
    customerId: user.id,
    storeId: prepared.store._id,
    storeOwnerId: prepared.store.contractorId,

    items: prepared.lines.map((line) => ({
      materialId: line.materialId,
      nameSnapshot: line.name,
      imageSnapshot: line.image,
      unitSnapshot: line.unit,
      priceSnapshot: line.price,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    })),

    deliveryAddress: delivery.address,
    deliveryLocation: delivery.point,
    locationConfirmed: true,
    locationSource: locationCorrection.locationSourceOf(
      body.locationSource,
    ),
    locationConfirmedAt: confirmedAt,

    distanceKm: prepared.summary.distanceKm,
    materialSubtotal: priced.materialSubtotal,
    shippingFee: priced.shippingFee,
    totalAmount: priced.totalAmount,

    depositRateSnapshot: priced.depositRateSnapshot,
    depositAmount: priced.depositAmount,
    platformFeeRateSnapshot: priced.platformFeeRateSnapshot,
    platformFeeAmount: priced.platformFeeAmount,
    storeDepositAmount: priced.storeDepositAmount,
    remainingAmount: priced.remainingAmount,

    paymentStatus: MATERIAL_PAYMENT_STATUS.UNPAID,
    status: MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
    customerNote: body.customerNote || '',

    statusHistory: [
      {
        status: MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
        actorId: user.id,
        actorRole: MATERIAL_ACTOR.CUSTOMER,
        note: 'COD / direct payment — no platform deposit',
      },
    ],
  });

  const { writeAudit, AUDIT_ACTION } = require('./auditService');

  await writeAudit({
    actorId: user.id,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.ORDER_CREATED,
    entityType: 'Order',
    entityId: String(order._id),
    meta: {
      orderId: String(order._id),
      orderCode: order.orderCode,
      storeId: String(prepared.store._id),
      storeName: prepared.store.name,
      amount: priced.totalAmount,
      isMaterialOrder: true,
      paymentMethod: 'COD',
    },
  }).catch(() => null);

  await notify({
    userId: prepared.store.contractorId,
    title: 'New material order',
    message: order.orderCode,
    type: NOTIFICATION_TYPE.ORDER_CREATED,
    link: `/store/orders/${order._id}`,
    meta: {
      materialOrderId: String(order._id),
    },
  }).catch(() => null);

  await locationCorrection.record({
    address: delivery.address,
    lat: body.lat,
    lng: body.lng,
    refId: body.providerRefId,
  }).catch(() => null);

  return order.toPublic();
}

/**
 * Lấy thông tin khách hàng từ PostgreSQL.
 *
 * MaterialOrder lưu customerId theo ID cũ của hệ thống.
 * Đối chiếu customerId với users.legacy_mongo_id để tìm đúng user.
 *
 * Schema Prisma cần có các trường:
 * legacy_mongo_id, full_name, phone_number.
 */
async function attachParties(rows) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const customerIds = [
    ...new Set(
      rows
        .map((row) => String(row.customerId || ''))
        .filter(Boolean),
    ),
  ];

  const storeIds = [
    ...new Set(
      rows
        .map((row) => String(row.storeId || ''))
        .filter(Boolean),
    ),
  ];

  const [users, stores] = await Promise.all([
    customerIds.length
      ? db().users.findMany({
          where: {
            legacy_mongo_id: {
              in: customerIds,
            },
          },
          select: {
            legacy_mongo_id: true,
            full_name: true,
            phone_number: true,
          },
        })
      : Promise.resolve([]),

    storeIds.length
      ? Store.find({
          _id: {
            $in: storeIds,
          },
        }).select('name')
      : Promise.resolve([]),
  ]);

  const usersByLegacyId = new Map(
    users.map((user) => [
      String(user.legacy_mongo_id),
      {
        name: user.full_name || '',
        phone: user.phone_number || '',
      },
    ]),
  );

  const storeNames = new Map(
    stores.map((store) => [
      String(store._id),
      store.name || '',
    ]),
  );

  return rows.map((row) => {
    const customerId = String(row.customerId || '');
    const customer = usersByLegacyId.get(customerId);

    return {
      ...row.toPublic(),

      customer: {
        id: customerId,
        name: customer?.name || '',
        phone: customer?.phone || '',
      },

      storeName: storeNames.get(String(row.storeId)) || '',
    };
  });
}

function emitMaterialOrder(order) {
  const payload = {
    orderId: String(order._id),
    status: order.status,
    orderCode: order.orderCode,
  };

  emitToUser(
    order.customerId,
    'material_order_updated',
    payload,
  );

  emitToUser(
    order.storeOwnerId,
    'material_order_updated',
    payload,
  );
}

async function listMine(user) {
  const rows = await MaterialOrder.find({
    customerId: user.id,
  })
    .sort({ createdAt: -1 })
    .limit(100);

  return attachParties(rows);
}

async function getForCustomer(user, id) {
  const order = await MaterialOrder.findOne({
    _id: id,
    customerId: user.id,
  });

  if (!order) {
    throw new ApiError(404, 'Material order not found');
  }

  const [presented] = await attachParties([order]);
  return presented;
}

async function listForStore(store) {
  const rows = await MaterialOrder.find({
    storeId: store._id,
  })
    .sort({ createdAt: -1 })
    .limit(100);

  return attachParties(rows);
}

async function getForStore(store, id) {
  const order = await MaterialOrder.findOne({
    _id: id,
    storeId: store._id,
  });

  if (!order) {
    throw new ApiError(404, 'Material order not found');
  }

  const [presented] = await attachParties([order]);
  return presented;
}

async function earningsForStore(store) {
  const rows = await MaterialOrder.find({
    storeId: store._id,
  }).select(
    'status totalAmount depositAmount platformFeeAmount storeDepositAmount remainingAmount paymentStatus remainingSettledOffline',
  );

  return summarizeMaterialEarnings(rows);
}

async function listAllForAdmin(queryParams = {}) {
  const {
    q,
    status,
    paymentStatus,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = queryParams;

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (currentPage - 1) * pageSize;

  const filter = {};

  if (status) {
    if (status.includes(',')) {
      filter.status = {
        $in: status
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      };
    } else {
      filter.status = status;
    }
  }

  if (paymentStatus) {
    filter.paymentStatus = paymentStatus;
  }

  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      const start = new Date(startDate);

      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);

      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  let rows = await MaterialOrder.find(filter).sort({
    createdAt: -1,
  });

  // Tìm kiếm theo mã đơn, tên khách hàng, số điện thoại và cửa hàng.
  if (q && String(q).trim()) {
    const searchText = String(q).trim();
    const searchLower = searchText.toLowerCase();

    const [matchingUsers, matchingStores] = await Promise.all([
      db().users.findMany({
        where: {
          OR: [
            {
              full_name: {
                contains: searchText,
                mode: 'insensitive',
              },
            },
            {
              phone_number: {
                contains: searchText,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          legacy_mongo_id: true,
        },
      }),

      db().stores.findMany({
        where: {
          name: {
            contains: searchText,
            mode: 'insensitive',
          },
        },
        select: {
          legacy_mongo_id: true,
        },
      }),
    ]);

    const userIds = new Set(
      matchingUsers
        .map((user) => user.legacy_mongo_id)
        .filter(Boolean)
        .map(String),
    );

    const storeIds = new Set(
      matchingStores
        .map((store) => store.legacy_mongo_id)
        .filter(Boolean)
        .map(String),
    );

    rows = rows.filter((order) => {
      const orderCode = String(order.orderCode || '').toLowerCase();

      const codeMatch = orderCode.includes(searchLower);

      const customerMatch = userIds.has(
        String(order.customerId || ''),
      );

      const storeMatch = storeIds.has(
        String(order.storeId || ''),
      );

      return codeMatch || customerMatch || storeMatch;
    });
  }

  const total = rows.length;
  const paginated = rows.slice(skip, skip + pageSize);
  const items = await attachParties(paginated);

  // Thống kê theo toàn bộ kết quả sau khi áp dụng bộ lọc.
  const stats = {
    orderCount: rows.length,

    pendingCount: rows.filter(
      (row) =>
        row.status === MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
    ).length,

    processingCount: rows.filter((row) =>
      [
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_DELIVERY',
      ].includes(row.status),
    ).length,

    deliveringCount: rows.filter(
      (row) => row.status === MATERIAL_ORDER_STATUS.DELIVERING,
    ).length,

    completedCount: rows.filter((row) =>
      [
        MATERIAL_ORDER_STATUS.COMPLETED,
        MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED,
      ].includes(row.status),
    ).length,

    cancelledCount: rows.filter(
      (row) => row.status === MATERIAL_ORDER_STATUS.CANCELLED,
    ).length,
  };

  return {
    items,

    pagination: {
      total,
      page: currentPage,
      limit: pageSize,
      pages: Math.ceil(total / pageSize),
    },

    stats,
  };
}

async function getForAdmin(id) {
  const order = await MaterialOrder.findById(id);

  if (!order) {
    throw new ApiError(404, 'Material order not found');
  }

  const [presented] = await attachParties([order]);
  return presented;
}

async function transition(order, actor, actorId, status, note) {
  assertMaterialStatusTransition(order.status, status, actor);

  order.status = status;

  order.statusHistory.push({
    status,
    actorId,
    actorRole: actor,
    note: note || '',
    createdAt: new Date(),
  });

  await order.save();

  emitMaterialOrder(order);

  const notice = materialStatusNotice(status, order.orderCode);

  if (notice) {
    const userId =
      notice.audience === 'customer'
        ? order.customerId
        : order.storeOwnerId;

    const link =
      notice.audience === 'customer'
        ? `/customer/material-orders/${order._id}`
        : `/store/orders/${order._id}`;

    await notify({
      userId,
      title: notice.title,
      message: notice.message,
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link,
      meta: {
        materialOrderId: String(order._id),
        status,
      },
    });
  }

  const { writeAudit } = require('./auditService');

  await writeAudit({
    actorId,
    actorRole: actor,
    action:
      status === 'CONFIRMED'
        ? 'ORDER_CONFIRMED'
        : 'STATUS_UPDATED',
    entityType: 'Order',
    entityId: String(order._id),
    meta: {
      orderId: String(order._id),
      orderCode: order.orderCode,
      status,
      isMaterialOrder: true,
      note: note || '',
    },
  }).catch(() => null);

  const [presented] = await attachParties([order]);
  return presented;
}

async function presentOrder(order) {
  const [presented] = await attachParties([order]);
  return presented;
}

async function updateStoreStatus(store, user, id, body) {
  if (body.status === MATERIAL_ORDER_STATUS.CANCELLED) {
    return cancelForStore(store, user, id, body.note);
  }

  return withOrderLock(id, async () => {
    const order = await MaterialOrder.findOne({
      _id: id,
      storeId: store._id,
    });

    if (!order) {
      throw new ApiError(404, 'Material order not found');
    }

    if (order.status === body.status) {
      return presentOrder(order);
    }

    return transition(
      order,
      MATERIAL_ACTOR.STORE,
      user.id,
      body.status,
      body.note,
    );
  });
}

/**
 * Chủ cửa hàng vật liệu hủy đơn COD.
 *
 * Quyền: chỉ MATERIAL_STORE_OWNER của đúng cửa hàng (kiểm tra storeId của đơn).
 * Trạng thái: chỉ hủy được trước khi giao hàng (STORE_CANCELLABLE_STATUSES).
 * Thanh toán: không hủy đơn đã thu COD vì hệ thống chưa có nghiệp vụ hoàn tiền.
 * Chống trùng: cập nhật có điều kiện (atomic) — chỉ một request thắng, nhờ đó
 * không ghi history trùng và không gửi notification trùng.
 */
async function cancelForStore(store, user, id, note = '') {
  return withOrderLock(id, async () => {
    const order = await MaterialOrder.findOne({
      _id: id,
      storeId: store._id,
    });

    if (!order) {
      throw new ApiError(404, 'Material order not found');
    }

    if (order.status === MATERIAL_ORDER_STATUS.CANCELLED) {
      return presentOrder(order);
    }

    assertMaterialStatusTransition(
      order.status,
      MATERIAL_ORDER_STATUS.CANCELLED,
      MATERIAL_ACTOR.STORE,
    );

    if (order.paymentStatus === MATERIAL_PAYMENT_STATUS.PAID) {
      throw new ApiError(
        409,
        'The order was already collected; cancel is not available',
        { code: 'PAYMENT_COLLECTED' },
      );
    }

    const result = await cancelOrderAtomic({
      orderId: order._id,
      allowedStatuses: STORE_CANCELLABLE_STATUSES,
      actorUserId: user.id,
      actorRole: MATERIAL_ACTOR.STORE,
      note,
    });

    if (!result.ok) {
      if (result.reason === 'ALREADY_CANCELLED') {
        return getForStore(store, id);
      }

      if (result.reason === 'CONFLICT') {
        throw new ApiError(
          409,
          'The order status changed; reload and try again',
          { code: 'STATUS_CONFLICT' },
        );
      }

      throw new ApiError(404, 'Material order not found');
    }

    const fresh = await MaterialOrder.findById(id) || order;

    emitMaterialOrder(fresh);

    const notice = storeCancelNotice(fresh.orderCode);

    await notify({
      userId: fresh.customerId,
      title: notice.title,
      message: notice.message,
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link: `/customer/material-orders/${fresh._id}`,
      meta: {
        materialOrderId: String(fresh._id),
        status: MATERIAL_ORDER_STATUS.CANCELLED,
      },
    }).catch(() => null);

    const { writeAudit } = require('./auditService');

    await writeAudit({
      actorId: user.id,
      actorRole: 'STORE',
      action: 'ORDER_CANCELLED',
      entityType: 'Order',
      entityId: String(fresh._id),
      meta: {
        orderId: String(fresh._id),
        orderCode: fresh.orderCode,
        status: MATERIAL_ORDER_STATUS.CANCELLED,
        reason: note || '',
        isMaterialOrder: true,
      },
    }).catch(() => null);

    return presentOrder(fresh);
  });
}

async function cancelMine(user, id) {
  return withOrderLock(id, async () => {
    const order = await MaterialOrder.findOne({
      _id: id,
      customerId: user.id,
    });

    if (!order) {
      throw new ApiError(404, 'Material order not found');
    }

    if (order.status === MATERIAL_ORDER_STATUS.CANCELLED) {
      return presentOrder(order);
    }

    return transition(
      order,
      MATERIAL_ACTOR.CUSTOMER,
      user.id,
      MATERIAL_ORDER_STATUS.CANCELLED,
      '',
    );
  });
}

async function receiveMine(user, id) {
  return withOrderLock(id, async () => {
    const order = await MaterialOrder.findOne({
      _id: id,
      customerId: user.id,
    });

    if (!order) {
      throw new ApiError(404, 'Material order not found');
    }

    if (order.status === MATERIAL_ORDER_STATUS.COMPLETED) return presentOrder(order);

    if (order.status !== MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED) {
      await transition(
        order,
        MATERIAL_ACTOR.CUSTOMER,
        user.id,
        MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED,
        '',
      );
    }

    if (order.status === MATERIAL_ORDER_STATUS.COMPLETED) return presentOrder(order);

    return transition(
      order,
      MATERIAL_ACTOR.SYSTEM,
      user.id,
      MATERIAL_ORDER_STATUS.COMPLETED,
      '',
    );
  });
}

async function markDirectPaymentCollected(order) {
  if (order.remainingSettledOffline && order.paymentStatus === MATERIAL_PAYMENT_STATUS.PAID) {
    return { duplicated: true };
  }

  order.remainingSettledOffline = true;
  order.remainingSettledAt =
    order.remainingSettledAt || new Date();
  order.paymentStatus = MATERIAL_PAYMENT_STATUS.PAID;

  await order.save();

  const { writeAudit } = require('./auditService');

  await writeAudit({
    actorId: order.storeOwnerId,
    actorRole: 'STORE',
    action: 'PAYMENT_COLLECTED',
    entityType: 'Order',
    entityId: String(order._id),
    meta: {
      orderId: String(order._id),
      orderCode: order.orderCode,
      paymentMethod: 'COD',
      amount: order.totalAmount,
      status: 'PAID',
      isMaterialOrder: true,
    },
  }).catch(() => null);

  return {
    duplicated: false,
  };
}

async function settleRemaining(user, id) {
  return withOrderLock(id, async () => {
    const order = await MaterialOrder.findOne({
      _id: id,
      customerId: user.id,
    });

    if (!order) {
      throw new ApiError(404, 'Material order not found');
    }

    if (
      ![
        MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED,
        MATERIAL_ORDER_STATUS.COMPLETED,
      ].includes(order.status)
    ) {
      throw new ApiError(
        409,
        'The remaining amount can be confirmed after you accept the delivery',
      );
    }

    await markDirectPaymentCollected(order);

    return presentOrder(order);
  });
}

async function settleCollected(store, user, id) {
  return withOrderLock(id, async () => {
    const order = await MaterialOrder.findOne({
      _id: id,
      storeId: store._id,
    });

    if (!order) {
      throw new ApiError(404, 'Material order not found');
    }

    if (
      ![
        MATERIAL_ORDER_STATUS.DELIVERED,
        MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED,
        MATERIAL_ORDER_STATUS.COMPLETED,
      ].includes(order.status)
    ) {
      throw new ApiError(
        409,
        'Direct payment can be confirmed after delivery',
      );
    }

    await markDirectPaymentCollected(order);

    return presentOrder(order);
  });
}

module.exports = {
  create,
  listMine,
  getForCustomer,
  listForStore,
  getForStore,
  updateStoreStatus,
  cancelForStore,
  earningsForStore,
  cancelMine,
  receiveMine,
  settleRemaining,
  settleCollected,
  listAllForAdmin,
  getForAdmin,
  replayFingerprint,
  isReplayOf,
  REPLAY_WINDOW_MS,
};
