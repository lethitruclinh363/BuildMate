const { MaterialOrder } = require('../models/MaterialOrder');
const { User } = require('../models/User');
const { Store } = require('../models/Store');
const { ApiError } = require('../utils/ApiError');
const { requirePlace } = require('../utils/geo');
const checkoutService = require('./material-checkout.service');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { emitToUser } = require('./socketService');
const {
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  priceMaterialOrder,
  assertMaterialStatusTransition,
  summarizeMaterialEarnings,
  materialStatusNotice,
} = require('../utils/material-order.rules');

function rejectQuote(summary) {
  if (summary.code === 'DELIVERY_DISABLED') {
    throw new ApiError(409, 'This store does not offer delivery', { code: summary.code });
  }
  if (summary.code === 'OUT_OF_RANGE') {
    throw new ApiError(409, 'Store delivers only within its service radius', {
      code: summary.code,
      serviceRadiusKm: summary.serviceRadiusKm,
    });
  }
  if (summary.code === 'BELOW_MINIMUM') {
    throw new ApiError(409, 'Order is below the minimum amount', {
      code: summary.code,
      minimumOrderAmount: summary.minimumOrderAmount,
    });
  }
  throw new ApiError(409, 'This order cannot be delivered', { code: summary.code });
}

async function create(user, body) {
  const prepared = await checkoutService.prepare(
    {
      storeId: body.storeId,
      address: body.deliveryAddress,
      lat: body.lat,
      lng: body.lng,
      items: body.items,
    },
    { requireLive: true }
  );
  if (!prepared.summary.ok) rejectQuote(prepared.summary);

  const priced = priceMaterialOrder(prepared.summary);
  if (!priced.ok) {
    throw new ApiError(422, 'Deposit does not cover the platform fee', { code: priced.code });
  }

  const delivery = requirePlace(
    { lat: body.lat, lng: body.lng, address: body.deliveryAddress, label: body.deliveryAddress },
    { addressMax: 240, labelMax: 240 }
  );
  if (!delivery) throw new ApiError(422, 'Coordinates are invalid');

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
    status: MATERIAL_ORDER_STATUS.PENDING_PAYMENT,
    customerNote: body.customerNote || '',
    statusHistory: [
      {
        status: MATERIAL_ORDER_STATUS.PENDING_PAYMENT,
        actorId: user.id,
        actorRole: MATERIAL_ACTOR.CUSTOMER,
        note: '',
      },
    ],
  });

  return order.toPublic();
}

async function attachParties(rows) {
  const customerIds = [...new Set(rows.map((row) => String(row.customerId)))];
  const storeIds = [...new Set(rows.map((row) => String(row.storeId)))];
  const [users, stores] = await Promise.all([
    User.find({ _id: { $in: customerIds } }).select('name'),
    Store.find({ _id: { $in: storeIds } }).select('name'),
  ]);
  const names = new Map(users.map((user) => [String(user._id), user.name || '']));
  const storeNames = new Map(stores.map((store) => [String(store._id), store.name || '']));
  return rows.map((row) => ({
    ...row.toPublic(),
    customer: { id: row.customerId, name: names.get(String(row.customerId)) || '' },
    storeName: storeNames.get(String(row.storeId)) || '',
  }));
}

function emitMaterialOrder(order) {
  const payload = {
    orderId: String(order._id),
    status: order.status,
    orderCode: order.orderCode,
  };
  emitToUser(order.customerId, 'material_order_updated', payload);
  emitToUser(order.storeOwnerId, 'material_order_updated', payload);
}

async function listMine(user) {
  const rows = await MaterialOrder.find({ customerId: user.id }).sort({ createdAt: -1 }).limit(100);
  return attachParties(rows);
}

async function getForCustomer(user, id) {
  const order = await MaterialOrder.findOne({ _id: id, customerId: user.id });
  if (!order) throw new ApiError(404, 'Material order not found');
  const [presented] = await attachParties([order]);
  return presented;
}

async function listForStore(store) {
  const rows = await MaterialOrder.find({ storeId: store._id }).sort({ createdAt: -1 }).limit(100);
  return attachParties(rows);
}

async function getForStore(store, id) {
  const order = await MaterialOrder.findOne({ _id: id, storeId: store._id });
  if (!order) throw new ApiError(404, 'Material order not found');
  const [presented] = await attachParties([order]);
  return presented;
}

async function earningsForStore(store) {
  const rows = await MaterialOrder.find({ storeId: store._id }).select(
    'status totalAmount depositAmount platformFeeAmount storeDepositAmount remainingAmount'
  );
  return summarizeMaterialEarnings(rows);
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
    const userId = notice.audience === 'customer' ? order.customerId : order.storeOwnerId;
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
      meta: { materialOrderId: String(order._id), status },
    });
  }
  const [presented] = await attachParties([order]);
  return presented;
}

async function updateStoreStatus(store, user, id, body) {
  const order = await MaterialOrder.findOne({ _id: id, storeId: store._id });
  if (!order) throw new ApiError(404, 'Material order not found');
  return transition(order, MATERIAL_ACTOR.STORE, user.id, body.status, body.note);
}

async function cancelMine(user, id) {
  const order = await MaterialOrder.findOne({ _id: id, customerId: user.id });
  if (!order) throw new ApiError(404, 'Material order not found');
  return transition(order, MATERIAL_ACTOR.CUSTOMER, user.id, MATERIAL_ORDER_STATUS.CANCELLED, '');
}

async function receiveMine(user, id) {
  const order = await MaterialOrder.findOne({ _id: id, customerId: user.id });
  if (!order) throw new ApiError(404, 'Material order not found');
  await transition(order, MATERIAL_ACTOR.CUSTOMER, user.id, MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED, '');
  return transition(order, MATERIAL_ACTOR.SYSTEM, user.id, MATERIAL_ORDER_STATUS.COMPLETED, '');
}

async function settleRemaining(user, id) {
  const order = await MaterialOrder.findOne({ _id: id, customerId: user.id });
  if (!order) throw new ApiError(404, 'Material order not found');
  if (![MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED, MATERIAL_ORDER_STATUS.COMPLETED].includes(order.status)) {
    throw new ApiError(409, 'The remaining amount can be confirmed after you accept the delivery');
  }
  if (!order.remainingSettledOffline) {
    order.remainingSettledOffline = true;
    order.remainingSettledAt = new Date();
    await order.save();
  }
  const [presented] = await attachParties([order]);
  return presented;
}

module.exports = {
  create,
  listMine,
  getForCustomer,
  listForStore,
  getForStore,
  updateStoreStatus,
  earningsForStore,
  cancelMine,
  receiveMine,
  settleRemaining,
};
