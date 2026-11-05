const { ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { Order, Payment, runInTransaction } = require('../repositories/commerceAccess');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { RepairRequest, ChatRoom, Quotation } = require('../repositories/conversationAccess');
const { ApiError } = require('../utils/ApiError');
const { CANCELLABLE_ORDER_STATUSES, generateOrderCode } = require('../utils/order.rules');
const {
  snapshotContractorQuote,
  defaultEscrowRecord,
} = require('../utils/contractor-finance');
const { PAYMENT_TYPE } = require('../models/Payment');
const escrowService = require('./escrowService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { emitToUser } = require('./socketService');

function isActor(userId, actorId) {
  return actorId != null && userId != null && String(userId) === String(actorId);
}

function emitOrder(event, order, extra = {}) {
  const { actorId, ...rest } = extra;
  const payload = {
    order: order.toPublic(),
    actorId: actorId != null ? String(actorId) : undefined,
    ...rest,
  };
  if (!isActor(order.customerId, actorId)) emitToUser(order.customerId, event, payload);
  if (!isActor(order.contractorId, actorId)) emitToUser(order.contractorId, event, payload);
}

function emitCreated(order, _room, actorId) {
  emitOrder('order_created', order, { actorId });
}

const completeLocks = new Map();
const depositLocks = new Map();

async function withCompleteLock(orderId, work) {
  const key = String(orderId);
  const pending = completeLocks.get(key);
  if (pending) return pending;
  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      completeLocks.delete(key);
    });
  completeLocks.set(key, next);
  return next;
}

async function withDepositLock(quotationId, work) {
  const key = `deposit:${quotationId}`;
  const pending = depositLocks.get(key);
  if (pending) return pending;
  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      depositLocks.delete(key);
    });
  depositLocks.set(key, next);
  return next;
}

async function findDepositPayment(quotationId, orderId) {
  if (quotationId) {
    const byQuote = await Payment.findOne({ quotationId, type: PAYMENT_TYPE.DEPOSIT });
    if (byQuote) return byQuote;
  }
  if (orderId) {
    return Payment.findOne({ orderId, type: PAYMENT_TYPE.DEPOSIT });
  }
  return null;
}

async function createDepositIntent(quotation, actorId, outerTx) {
  return withDepositLock(quotation._id, async () => {
    const existingOrder = await Order.findOne({ quotationId: quotation._id });
    const existingPay = await findDepositPayment(quotation._id, existingOrder?._id);
    if (existingPay) {
      return {
        order: existingOrder ? existingOrder.toPublic() : null,
        payment: existingPay.toPublic(),
        notification: null,
        duplicated: true,
      };
    }
    if (existingOrder) {
      return {
        order: existingOrder.toPublic(),
        payment: null,
        notification: null,
        duplicated: true,
      };
    }

    const finance = snapshotContractorQuote(quotation.totalCost);
    const work = async (tx) => {
      const payment = await Payment.create({
        orderId: null,
        quotationId: quotation._id,
        customerId: quotation.customerId,
        contractorId: quotation.contractorId,
        amount: finance.depositAmount,
        type: PAYMENT_TYPE.DEPOSIT,
        status: PAYMENT_STATUS.UNPAID,
        provider: 'mock',
        metadata: {
          finance,
          escrow: defaultEscrowRecord(finance),
          mock: true,
          quotationId: String(quotation._id),
          requestId: String(quotation.requestId),
        },
      }, tx);
      return { payment };
    };

    let created;
    try {
      created = outerTx ? await work(outerTx) : await runInTransaction(work);
    } catch (err) {
      if (err.code === 11000 || err.code === 'P2002') {
        const dup = await findDepositPayment(quotation._id);
        if (dup) {
          const order = await Order.findOne({ quotationId: quotation._id });
          return {
            order: order ? order.toPublic() : null,
            payment: dup.toPublic(),
            notification: null,
            duplicated: true,
          };
        }
      }
      throw err;
    }

    return {
      order: null,
      payment: created.payment.toPublic(),
      notification: null,
      duplicated: false,
    };
  });
}

async function createFromQuotation(quotation, request, actorId, outerTx, options = {}) {
  const existing = await Order.findOne({ quotationId: quotation._id });
  if (existing) {
    const payment = options.attachPayment
      || await findDepositPayment(quotation._id, existing._id);
    if (payment && !payment.orderId) {
      payment.orderId = existing._id;
      payment.quotationId = quotation._id;
      await payment.save(outerTx);
    }
    return {
      order: existing.toPublic(),
      payment: payment ? payment.toPublic() : null,
      notification: null,
      duplicated: true,
    };
  }

  const room = await ChatRoom.findOne({ requestId: quotation.requestId });
  const afterDeposit = Boolean(options.afterDeposit);
  const work = async (tx) => {
    const order = await Order.create({
      orderCode: generateOrderCode(),
      quotationId: quotation._id,
      requestId: quotation.requestId,
      customerId: quotation.customerId,
      contractorId: quotation.contractorId,
      storeId: request?.storeId || null,
      title: request?.title || 'Construction order',
      description: request?.description || '',
      location: request?.location || { type: 'Point', coordinates: [105.746, 10.045] },
      amount: quotation.totalCost,
      status: afterDeposit ? ORDER_STATUS.DEPOSIT_PAID : ORDER_STATUS.QUOTATION_ACCEPTED,
      paymentStatus: afterDeposit ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.UNPAID,
    }, tx);
    const finance = snapshotContractorQuote(quotation.totalCost);
    let payment = options.attachPayment;
    if (payment) {
      payment.orderId = order._id;
      payment.quotationId = quotation._id;
      await payment.save(tx);
    } else {
      payment = await Payment.create({
        orderId: order._id,
        quotationId: quotation._id,
        customerId: quotation.customerId,
        contractorId: quotation.contractorId,
        amount: finance.depositAmount,
        type: PAYMENT_TYPE.DEPOSIT,
        status: PAYMENT_STATUS.UNPAID,
        provider: 'mock',
        metadata: {
          finance,
          escrow: defaultEscrowRecord(finance),
          mock: true,
          quotationId: String(quotation._id),
          requestId: String(quotation.requestId),
        },
      }, tx);
    }
    const notification = await notify({
      userId: quotation.contractorId,
      title: 'New repair job',
      message: `${order.title} · ${order.orderCode}`,
      type: NOTIFICATION_TYPE.ORDER_CREATED,
      link: `/contractor/orders`,
      meta: {
        orderId: String(order._id),
        quotationId: String(quotation._id),
        dedupeKey: `order-created:${quotation._id}`,
      },
    });
    await writeAudit({
      actorId,
      actorRole: 'CUSTOMER',
      action: AUDIT_ACTION.ORDER_CREATED,
      entityType: 'Order',
      entityId: order._id,
      meta: { quotationId: String(quotation._id), amount: order.amount },
    });
    await escrowService.ensureEscrowRow(payment, tx);
    return { order, payment, notification };
  };

  let created;
  try {
    created = outerTx ? await work(outerTx) : await runInTransaction(work);
  } catch (err) {
    if (err.code === 11000 || err.code === 'P2002') {
      const dup = await Order.findOne({ quotationId: quotation._id });
      if (dup) {
        const payment = options.attachPayment || await findDepositPayment(quotation._id, dup._id);
        return {
          order: dup.toPublic(),
          payment: payment ? payment.toPublic() : null,
          notification: null,
          duplicated: true,
        };
      }
    }
    throw err;
  }

  if (!outerTx) emitCreated(created.order, room, actorId);
  return {
    order: created.order.toPublic(),
    payment: created.payment.toPublic(),
    notification: created.notification,
    duplicated: false,
    _emit: () => emitCreated(created.order, room, actorId),
  };
}

async function assertParty(order, user) {
  const uid = String(user.id);
  if (user.role === 'ADMIN') return order;
  if (String(order.customerId) === uid || String(order.contractorId) === uid) return order;
  throw new ApiError(403, 'You cannot view this order');
}

async function getOrder(id, user) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found');
  await assertParty(order, user);
  const payment = await Payment.findOne({ orderId: order._id, type: PAYMENT_TYPE.DEPOSIT })
    || await Payment.findOne({ orderId: order._id });
  const extra = payment && payment.type === PAYMENT_TYPE.DEPOSIT ? escrowService.financeOf(payment) : {};
  return {
    ...order.toPublic(),
    payment: payment ? payment.toPublic() : null,
    finance: extra.finance || null,
    escrow: extra.escrow || null,
    assignments: [],
  };
}

async function listForCustomer(customerId) {
  const rows = await Order.find({ customerId }).sort({ createdAt: -1 });
  return rows
    .filter((row) => row.status !== ORDER_STATUS.QUOTATION_ACCEPTED)
    .map((row) => row.toPublic());
}

async function listForContractor(contractorId) {
  const rows = await Order.find({ contractorId }).sort({ createdAt: -1 });
  return rows
    .filter((row) => row.status !== ORDER_STATUS.QUOTATION_ACCEPTED)
    .map((row) => row.toPublic());
}

async function completeOrder(id, customerId) {
  return withCompleteLock(id, () => acceptCompletedJob(id, customerId));
}

async function acceptCompletedJob(id, customerId) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.customerId) !== String(customerId)) {
    throw new ApiError(403, 'Only the customer can complete this order');
  }
  if (order.status === ORDER_STATUS.CUSTOMER_ACCEPTED) {
    return { order: order.toPublic(), notification: null, duplicated: true };
  }
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new ApiError(409, 'Order is not waiting for customer acceptance');
  }

  order.status = ORDER_STATUS.CUSTOMER_ACCEPTED;
  order.completedAt = new Date();
  await runInTransaction(async (tx) => {
    await order.save(tx);
    await RepairRequest.findByIdAndUpdate(order.requestId, { status: REQUEST_STATUS.COMPLETED }, tx);
  });
  await escrowService.maybeMarkReleasePending(order._id);

  const notification = await notify({
    userId: order.contractorId,
    title: 'Customer accepted the job',
    message: order.title,
    type: NOTIFICATION_TYPE.ORDER_COMPLETED,
    link: `/contractor/orders`,
    meta: { orderId: String(order._id), dedupeKey: `order-completed:${order._id}` },
  });

  await writeAudit({
    actorId: customerId,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.ORDER_COMPLETED,
    entityType: 'Order',
    entityId: order._id,
  });

  emitOrder('order_completed', order, { actorId: customerId });
  return { order: order.toPublic(), notification };
}

async function cancelOrder(id, user, reason = '') {
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(user.id);
  const party = String(order.customerId) === uid || String(order.contractorId) === uid || user.role === 'ADMIN';
  if (!party) throw new ApiError(403, 'You cannot cancel this order');
  if (!CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
    throw new ApiError(409, 'Order can no longer be cancelled');
  }

  await runInTransaction(async (tx) => {
    const deposit = await Payment.findOne({ orderId: order._id, type: PAYMENT_TYPE.DEPOSIT });
    const actorIsCustomer = String(order.customerId) === uid;
    const actorIsContractor = String(order.contractorId) === uid;
    if (deposit && deposit.status === PAYMENT_STATUS.PAID) {
      if (actorIsContractor) {
        await escrowService.refundDeposit(order._id, user.id, reason || 'Contractor cancelled');
      } else if (actorIsCustomer) {
        await escrowService.holdAfterCustomerCancel(order._id, user, reason || 'Customer cancelled after deposit');
      }
    } else if (deposit) {
      await escrowService.holdAfterCustomerCancel(order._id, user, reason || 'Cancelled before deposit');
    }

    order.status = ORDER_STATUS.CANCELLED;
    order.cancelReason = reason || 'Cancelled';
    order.cancelledBy = user.id;
    order.cancelledAt = new Date();
    await order.save(tx);
    await RepairRequest.findByIdAndUpdate(order.requestId, { status: REQUEST_STATUS.CANCELLED }, tx);
  });

  const other = String(order.customerId) === uid ? order.contractorId : order.customerId;
  const otherIsCustomer = String(other) === String(order.customerId);
  await notify({
    userId: other,
    title: 'Order cancelled',
    message: order.title,
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: otherIsCustomer ? `/customer/orders/${order._id}` : `/contractor/orders/${order._id}`,
    meta: { orderId: String(order._id) },
  });

  return order.toPublic();
}

async function getBundleByQuotation(quotationId) {
  const quotation = await Quotation.findById(quotationId);
  const order = await Order.findOne({ quotationId });
  const payment = await findDepositPayment(quotationId, order?._id)
    || (order ? await Payment.findOne({ orderId: order._id }) : null);
  return {
    quotation: quotation ? quotation.toPublic() : null,
    order: order ? order.toPublic() : null,
    payment: payment ? payment.toPublic() : null,
  };
}

module.exports = {
  createFromQuotation,
  createDepositIntent,
  findDepositPayment,
  getOrder,
  listForCustomer,
  listForContractor,
  completeOrder,
  cancelOrder,
  getBundleByQuotation,
  assertParty,
  emitOrder,
};
