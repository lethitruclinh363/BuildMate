const { ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { Order, Payment, runInTransaction } = require('../repositories/commerceAccess');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { RepairRequest, ChatRoom, Quotation } = require('../repositories/conversationAccess');
const { ApiError } = require('../utils/ApiError');
const { CANCELLABLE_ORDER_STATUSES, generateOrderCode } = require('../utils/order.rules');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { emitToUser, emitToRoom } = require('./socketService');

function emitOrder(event, order, extra = {}) {
  const payload = { order: order.toPublic(), ...extra };
  emitToUser(order.customerId, event, payload);
  emitToUser(order.contractorId, event, payload);
}

function emitCreated(order, room) {
  emitOrder('order_created', order);
  if (room) emitToRoom(room._id, 'order_created', { order: order.toPublic() });
}

async function createFromQuotation(quotation, request, actorId, outerTx) {
  const existing = await Order.findOne({ quotationId: quotation._id });
  if (existing) {
    const payment = await Payment.findOne({ orderId: existing._id });
    return {
      order: existing.toPublic(),
      payment: payment ? payment.toPublic() : null,
      notification: null,
      duplicated: true,
    };
  }

  const room = await ChatRoom.findOne({ requestId: quotation.requestId });
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
      status: ORDER_STATUS.QUOTATION_ACCEPTED,
      paymentStatus: PAYMENT_STATUS.UNPAID,
    }, tx);
    const payment = await Payment.create({
      orderId: order._id,
      customerId: quotation.customerId,
      contractorId: quotation.contractorId,
      amount: quotation.totalCost,
      type: 'FULL_PAYMENT',
      status: PAYMENT_STATUS.UNPAID,
      provider: 'mock',
      metadata: {},
    }, tx);
    const notification = await notify({
      userId: quotation.contractorId,
      title: 'New repair job',
      message: `${order.title} · ${order.orderCode}`,
      type: NOTIFICATION_TYPE.ORDER_CREATED,
      link: `/contractor/orders`,
      meta: { orderId: String(order._id), quotationId: String(quotation._id) },
    });
    await writeAudit({
      actorId,
      actorRole: 'CUSTOMER',
      action: AUDIT_ACTION.ORDER_CREATED,
      entityType: 'Order',
      entityId: order._id,
      meta: { quotationId: String(quotation._id), amount: order.amount },
    });
    return { order, payment, notification };
  };

  let created;
  try {
    created = outerTx ? await work(outerTx) : await runInTransaction(work);
  } catch (err) {
    if (err.code === 11000) {
      const dup = await Order.findOne({ quotationId: quotation._id });
      if (dup) {
        const payment = await Payment.findOne({ orderId: dup._id });
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

  if (!outerTx) emitCreated(created.order, room);
  return {
    order: created.order.toPublic(),
    payment: created.payment.toPublic(),
    notification: created.notification,
    duplicated: false,
    _emit: () => emitCreated(created.order, room),
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
  const payment = await Payment.findOne({ orderId: order._id });
  return {
    ...order.toPublic(),
    payment: payment ? payment.toPublic() : null,
    assignments: [],
  };
}

async function listForCustomer(customerId) {
  const rows = await Order.find({ customerId }).sort({ createdAt: -1 });
  return rows.map((row) => row.toPublic());
}

async function listForContractor(contractorId) {
  const rows = await Order.find({ contractorId }).sort({ createdAt: -1 });
  return rows.map((row) => row.toPublic());
}

async function completeOrder(id, customerId) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.customerId) !== String(customerId)) {
    throw new ApiError(403, 'Only the customer can complete this order');
  }
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new ApiError(409, 'Order is not waiting for customer acceptance');
  }
  // Handover does not require PAID.
  // Payment UNPAID + customer acceptance is valid (COD / pay-after-work).
  // Commission / earnings only exist after Payment PAID.

  order.status = ORDER_STATUS.CUSTOMER_ACCEPTED;
  order.completedAt = new Date();
  await runInTransaction(async (tx) => {
    await order.save(tx);
    await RepairRequest.findByIdAndUpdate(order.requestId, { status: REQUEST_STATUS.COMPLETED }, tx);
  });

  const notification = await notify({
    userId: order.contractorId,
    title: 'Customer accepted the job',
    message: order.title,
    type: NOTIFICATION_TYPE.ORDER_COMPLETED,
    link: `/contractor/orders`,
    meta: { orderId: String(order._id) },
  });

  await writeAudit({
    actorId: customerId,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.ORDER_COMPLETED,
    entityType: 'Order',
    entityId: order._id,
  });

  emitOrder('order_completed', order);
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

  order.status = ORDER_STATUS.CANCELLED;
  order.cancelReason = reason || 'Cancelled';
  order.cancelledBy = user.id;
  order.cancelledAt = new Date();
  await runInTransaction(async (tx) => {
    await order.save(tx);
    await RepairRequest.findByIdAndUpdate(order.requestId, { status: REQUEST_STATUS.CANCELLED }, tx);
  });

  const other = String(order.customerId) === uid ? order.contractorId : order.customerId;
  await notify({
    userId: other,
    title: 'Order cancelled',
    message: order.title,
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    meta: { orderId: String(order._id) },
  });

  return order.toPublic();
}

async function getBundleByQuotation(quotationId) {
  const quotation = await Quotation.findById(quotationId);
  const order = await Order.findOne({ quotationId });
  const payment = order ? await Payment.findOne({ orderId: order._id }) : null;
  return {
    quotation: quotation ? quotation.toPublic() : null,
    order: order ? order.toPublic() : null,
    payment: payment ? payment.toPublic() : null,
  };
}

module.exports = {
  createFromQuotation,
  getOrder,
  listForCustomer,
  listForContractor,
  completeOrder,
  cancelOrder,
  getBundleByQuotation,
  assertParty,
  emitOrder,
};
