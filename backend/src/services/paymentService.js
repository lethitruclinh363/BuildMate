const crypto = require('crypto');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { Payment, PAYMENT_TYPE } = require('../models/Payment');
const { ApiError } = require('../utils/ApiError');
const { MockPaymentProvider } = require('../providers/MockPaymentProvider');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const commissionService = require('./commissionService');
const { orderStatusAfterDeposit } = require('../utils/order.rules');
const { env } = require('../config/env');

const provider = new MockPaymentProvider();

function rollupStatus(payments) {
  if (!payments.length) return PAYMENT_STATUS.UNPAID;
  if (payments.every((row) => row.status === PAYMENT_STATUS.REFUNDED)) return PAYMENT_STATUS.REFUNDED;
  if (payments.some((row) => row.status === PAYMENT_STATUS.PAID) && payments.every((row) => row.status === PAYMENT_STATUS.PAID || row.status === PAYMENT_STATUS.REFUNDED)) {
    const paid = payments.filter((row) => row.status === PAYMENT_STATUS.PAID).reduce((sum, row) => sum + row.amount, 0);
    const due = payments.reduce((sum, row) => sum + row.amount, 0);
    if (paid >= due) return PAYMENT_STATUS.PAID;
  }
  if (payments.some((row) => row.status === PAYMENT_STATUS.PENDING)) return PAYMENT_STATUS.PENDING;
  if (payments.some((row) => row.status === PAYMENT_STATUS.FAILED) && !payments.some((row) => row.status === PAYMENT_STATUS.PAID)) {
    return PAYMENT_STATUS.FAILED;
  }
  if (payments.some((row) => row.status === PAYMENT_STATUS.PAID)) return PAYMENT_STATUS.UNPAID;
  return PAYMENT_STATUS.UNPAID;
}

async function syncOrderPaymentStatus(orderId) {
  const rows = await Payment.find({ orderId });
  const order = await Order.findById(orderId);
  if (!order) return;
  order.paymentStatus = rollupStatus(rows);
  await order.save();
  return order;
}

async function assertPaymentAccess(payment, user, { customerOnly = false } = {}) {
  if (!user) throw new ApiError(401, 'Authentication required');
  if (user.role === 'ADMIN') return;
  if (customerOnly) {
    if (String(payment.customerId) !== String(user.id)) {
      throw new ApiError(403, 'You cannot checkout this payment');
    }
    return;
  }
  const uid = String(user.id);
  if (uid === String(payment.customerId) || uid === String(payment.contractorId)) return;
  throw new ApiError(403, 'You cannot view this payment');
}

async function checkout(paymentId, user, { method = 'MOCK' } = {}) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  await assertPaymentAccess(payment, user, { customerOnly: true });

  const order = await Order.findById(payment.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new ApiError(409, 'Cancelled orders cannot be paid');
  }
  if (payment.type === PAYMENT_TYPE.FINAL_PAYMENT) {
    if (![ORDER_STATUS.COMPLETED, ORDER_STATUS.CUSTOMER_ACCEPTED].includes(order.status)) {
      throw new ApiError(409, 'Final payment is only allowed after the job is finished');
    }
  }

  if (payment.type === PAYMENT_TYPE.FULL_PAYMENT) {
    payment.amount = order.amount;
  }

  if (payment.status === PAYMENT_STATUS.PAID || payment.status === PAYMENT_STATUS.REFUNDED) {
    throw new ApiError(409, 'This payment is already closed');
  }
  if (payment.status === PAYMENT_STATUS.PENDING) {
    throw new ApiError(409, 'Checkout already in progress');
  }

  const session = provider.createCheckout(payment);
  payment.status = PAYMENT_STATUS.PENDING;
  payment.provider = 'mock';
  payment.transactionCode = session.transactionCode;
  payment.metadata = {
    ...(payment.metadata || {}),
    method,
    providerRef: session.providerRef,
    nonce: crypto.randomBytes(4).toString('hex'),
  };
  await payment.save();
  await syncOrderPaymentStatus(order._id);

  await writeAudit({
    actorId: user.id,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.PAYMENT_CREATED,
    entityType: 'Payment',
    entityId: payment._id,
    meta: { orderId: String(order._id), transactionCode: payment.transactionCode },
  });

  return { payment: payment.toPublic(), checkout: session };
}

async function markPaid(payment, actorId, actorRole = 'SYSTEM') {
  if (payment.status === PAYMENT_STATUS.PAID) {
    const commission = await commissionService.createForPaidPayment(payment, actorId);
    return { payment: payment.toPublic(), commission: commission ? commission.toPublic() : null, duplicated: true };
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw new ApiError(409, 'Payment must be PENDING before capture');
  }

  payment.status = PAYMENT_STATUS.PAID;
  payment.paidAt = new Date();
  await payment.save();
  const paidOrder = await syncOrderPaymentStatus(payment.orderId);
  if (payment.type === PAYMENT_TYPE.DEPOSIT && paidOrder) {
    const next = orderStatusAfterDeposit(paidOrder.status);
    if (next !== paidOrder.status) {
      paidOrder.status = next;
      await paidOrder.save();
    }
  }

  const commission = await commissionService.createForPaidPayment(payment, actorId);

  await notify({
    userId: payment.contractorId,
    title: 'Payment received',
    message: `${payment.amount.toLocaleString('vi-VN')}đ captured`,
    type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
    link: '/contractor/orders',
    meta: { paymentId: String(payment._id), orderId: String(payment.orderId) },
  });

  await writeAudit({
    actorId,
    actorRole,
    action: AUDIT_ACTION.PAYMENT_PAID,
    entityType: 'Payment',
    entityId: payment._id,
    meta: { orderId: String(payment.orderId), amount: payment.amount },
  });

  return {
    payment: payment.toPublic(),
    commission: commission.toPublic(),
    duplicated: false,
  };
}

async function mockSuccess(paymentId, user) {
  if (env.isProd) throw new ApiError(404, 'Route not found');
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  await assertPaymentAccess(payment, user, { customerOnly: true });
  return markPaid(payment, user.id, 'CUSTOMER');
}

async function refund(paymentId, adminId, reason = '') {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw new ApiError(409, 'Only PAID payments can be refunded');
  }
  payment.status = PAYMENT_STATUS.REFUNDED;
  payment.refundedAt = new Date();
  payment.metadata = { ...(payment.metadata || {}), refundReason: reason || 'Admin refund' };
  await payment.save();
  await commissionService.reverseForPayment(payment._id);
  await syncOrderPaymentStatus(payment.orderId);

  await notify({
    userId: payment.customerId,
    title: 'Payment refunded',
    message: `${payment.amount.toLocaleString('vi-VN')}đ refunded`,
    type: NOTIFICATION_TYPE.PAYMENT_FAILED,
    meta: { paymentId: String(payment._id), orderId: String(payment.orderId) },
  });

  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.PAYMENT_REFUNDED,
    entityType: 'Payment',
    entityId: payment._id,
    meta: { reason, orderId: String(payment.orderId) },
  });

  return payment.toPublic();
}

async function listForOrder(orderId, user) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(user.id);
  const allowed =
    user.role === 'ADMIN' || uid === String(order.customerId) || uid === String(order.contractorId);
  if (!allowed) throw new ApiError(403, 'You cannot view these payments');

  const items = await Payment.find({ orderId: order._id }).sort({ createdAt: 1 });
  const paidAmount = items
    .filter((row) => row.status === PAYMENT_STATUS.PAID)
    .reduce((sum, row) => sum + row.amount, 0);
  const due = items.reduce((sum, row) => sum + row.amount, 0);
  return {
    summary: {
      status: rollupStatus(items),
      amount: order.amount,
      paidAmount,
      remainingAmount: Math.max(order.amount - paidAmount, 0),
      due,
    },
    items: items.map((row) => row.toPublic()),
  };
}

module.exports = { checkout, mockSuccess, refund, listForOrder, markPaid, syncOrderPaymentStatus };
