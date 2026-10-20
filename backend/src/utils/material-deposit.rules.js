const { isLegacyMaterialOrder } = require('./contractor-finance');

function fail(status, message) {
  return { ok: false, status, message };
}

function evaluateDepositCheckout(order, userId) {
  if (!order) return fail(404, 'Material order not found');
  if (String(order.customerId) !== String(userId)) return fail(403, 'You cannot pay this material order');
  if (order.status === 'CANCELLED') return fail(409, 'Cancelled orders cannot be paid');
  if (!isLegacyMaterialOrder(order)) {
    return fail(409, 'New material orders do not use a platform deposit');
  }
  if (order.status === 'DEPOSIT_PAID' || order.paymentStatus === 'PAID') return { ok: true, action: 'replay' };
  if (order.status !== 'PENDING_PAYMENT') return fail(409, 'This material order is not waiting for a deposit');
  if (order.paymentStatus === 'PENDING') return { ok: true, action: 'resume' };
  return { ok: true, action: 'start' };
}

function evaluateDepositCapture(order, payment, userId) {
  if (!order) return fail(404, 'Material order not found');
  if (String(order.customerId) !== String(userId)) return fail(403, 'You cannot pay this material order');
  if (order.status === 'CANCELLED') return fail(409, 'Cancelled orders cannot be paid');
  if (!isLegacyMaterialOrder(order)) {
    return fail(409, 'New material orders do not use a platform deposit');
  }
  if (!payment) return fail(409, 'Checkout has not started');
  if (payment.status === 'PAID' || order.status === 'DEPOSIT_PAID') return { ok: true, action: 'replay' };
  if (payment.status !== 'PENDING') return fail(409, 'Payment must be PENDING before capture');
  if (order.status !== 'PENDING_PAYMENT') return fail(409, 'This material order is not waiting for a deposit');
  return { ok: true, action: 'capture' };
}

module.exports = { evaluateDepositCheckout, evaluateDepositCapture };
