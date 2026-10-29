const crypto = require('crypto');
const { ApiError } = require('./ApiError');
const { roundVnd } = require('./material-checkout');

const PLATFORM_FEE_RATE = 0;
const DEPOSIT_RATE = 0;
const LEGACY_PLATFORM_FEE_RATE = 0.05;
const LEGACY_DEPOSIT_RATE = 0.15;

const MATERIAL_ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
  DEPOSIT_PAID: 'DEPOSIT_PAID',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  CUSTOMER_RECEIVED: 'CUSTOMER_RECEIVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

const MATERIAL_PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const MATERIAL_ACTOR = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  STORE: 'STORE',
  SYSTEM: 'SYSTEM',
});

const TRANSITIONS = Object.freeze({
  PENDING_PAYMENT: Object.freeze(['DEPOSIT_PAID', 'CANCELLED']),
  PENDING_CONFIRMATION: Object.freeze(['CONFIRMED', 'CANCELLED']),
  DEPOSIT_PAID: Object.freeze(['CONFIRMED', 'CANCELLED']),
  CONFIRMED: Object.freeze(['PREPARING', 'CANCELLED']),
  PREPARING: Object.freeze(['READY_FOR_DELIVERY', 'CANCELLED']),
  READY_FOR_DELIVERY: Object.freeze(['DELIVERING', 'CANCELLED']),
  DELIVERING: Object.freeze(['DELIVERED']),
  DELIVERED: Object.freeze(['CUSTOMER_RECEIVED']),
  CUSTOMER_RECEIVED: Object.freeze(['COMPLETED']),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

const ACTOR_MOVES = Object.freeze({
  SYSTEM: Object.freeze({
    PENDING_PAYMENT: Object.freeze(['DEPOSIT_PAID']),
    CUSTOMER_RECEIVED: Object.freeze(['COMPLETED']),
  }),
  STORE: Object.freeze({
    PENDING_PAYMENT: Object.freeze(['CANCELLED']),
    PENDING_CONFIRMATION: Object.freeze(['CONFIRMED', 'CANCELLED']),
    DEPOSIT_PAID: Object.freeze(['CONFIRMED', 'CANCELLED']),
    CONFIRMED: Object.freeze(['PREPARING', 'CANCELLED']),
    PREPARING: Object.freeze(['READY_FOR_DELIVERY', 'CANCELLED']),
    READY_FOR_DELIVERY: Object.freeze(['DELIVERING', 'CANCELLED']),
    DELIVERING: Object.freeze(['DELIVERED']),
    CUSTOMER_RECEIVED: Object.freeze(['COMPLETED']),
  }),
  CUSTOMER: Object.freeze({
    PENDING_PAYMENT: Object.freeze(['CANCELLED']),
    PENDING_CONFIRMATION: Object.freeze(['CANCELLED']),
    DELIVERED: Object.freeze(['CUSTOMER_RECEIVED']),
  }),
});

// Trạng thái mà MATERIAL_STORE_OWNER được phép hủy đơn vật liệu COD.
// Đơn đã giao, đang giao, khách đã nhận hoặc hoàn thành đều không được hủy.
const STORE_CANCELLABLE_STATUSES = Object.freeze([
  MATERIAL_ORDER_STATUS.PENDING_PAYMENT,
  MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
  MATERIAL_ORDER_STATUS.DEPOSIT_PAID,
  MATERIAL_ORDER_STATUS.CONFIRMED,
  MATERIAL_ORDER_STATUS.PREPARING,
  MATERIAL_ORDER_STATUS.READY_FOR_DELIVERY,
]);

const STORE_FORWARD = Object.freeze({
  PENDING_CONFIRMATION: MATERIAL_ORDER_STATUS.CONFIRMED,
  DEPOSIT_PAID: MATERIAL_ORDER_STATUS.CONFIRMED,
  CONFIRMED: MATERIAL_ORDER_STATUS.PREPARING,
  PREPARING: MATERIAL_ORDER_STATUS.READY_FOR_DELIVERY,
  READY_FOR_DELIVERY: MATERIAL_ORDER_STATUS.DELIVERING,
  DELIVERING: MATERIAL_ORDER_STATUS.DELIVERED,
});

function nextStoreFulfillment(status) {
  return STORE_FORWARD[status] || null;
}

function summarizeMaterialEarnings(orders) {
  const counted = (orders || []).filter(
    (order) =>
      order.status !== MATERIAL_ORDER_STATUS.PENDING_PAYMENT
      && order.status !== MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION
      && order.status !== MATERIAL_ORDER_STATUS.CANCELLED
  );
  const completed = counted.filter((order) =>
    order.status === MATERIAL_ORDER_STATUS.COMPLETED || order.status === MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED
  );
  const inFlight = counted.filter((order) =>
    ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY'].includes(order.status)
  );
  const delivering = counted.filter((order) => order.status === MATERIAL_ORDER_STATUS.DELIVERING);
  const cancelled = (orders || []).filter((order) => order.status === MATERIAL_ORDER_STATUS.CANCELLED);
  const sum = (list, key) => list.reduce((total, order) => total + roundVnd(order[key]), 0);
  const collected = counted.filter((order) => order.paymentStatus === MATERIAL_PAYMENT_STATUS.PAID || order.remainingSettledOffline);
  return {
    orderCount: (orders || []).length,
    processingCount: inFlight.length,
    deliveringCount: delivering.length,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    orderValue: sum(completed, 'totalAmount'),
    collectedAmount: sum(collected, 'totalAmount'),
    uncollectedAmount: Math.max(sum(counted, 'totalAmount') - sum(collected, 'totalAmount'), 0),
    platformFees: 0,
    onlineDeposits: 0,
    storeDeposits: 0,
    directRemaining: sum(counted, 'remainingAmount'),
  };
}

function materialStatusNotice(status, orderCode) {
  const code = orderCode || '';
  if (status === MATERIAL_ORDER_STATUS.CONFIRMED) {
    return { audience: 'customer', title: 'Cửa hàng đã xác nhận đơn', message: `${code} đã được cửa hàng xác nhận` };
  }
  if (status === MATERIAL_ORDER_STATUS.DELIVERING) {
    return { audience: 'customer', title: 'Cửa hàng đang giao hàng', message: `${code} đang được giao` };
  }
  if (status === MATERIAL_ORDER_STATUS.DELIVERED) {
    return { audience: 'customer', title: 'Đơn đã giao', message: `${code} đã được giao tới địa chỉ nhận` };
  }
  if (status === MATERIAL_ORDER_STATUS.CUSTOMER_RECEIVED) {
    return { audience: 'store', title: 'Khách đã nhận hàng', message: `${code} đã được khách xác nhận nhận` };
  }
  return null;
}

/**
 * Thông báo cho khách hàng khi CHÍNH CỬA HÀNG hủy đơn vật liệu.
 *
 * Tách riêng khỏi materialStatusNotice vì trạng thái CANCELLED dùng chung cho cả
 * khách tự hủy và cửa hàng hủy; nếu dựa theo status thì khách tự hủy cũng sẽ nhận
 * thông báo "cửa hàng hủy đơn" (sai). Chỉ luồng cửa hàng hủy mới gọi helper này.
 */
function storeCancelNotice(orderCode) {
  const code = orderCode || '';
  return { audience: 'customer', title: 'Cửa hàng đã hủy đơn', message: `${code} đã bị cửa hàng hủy` };
}

function generateMaterialOrderCode() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VL-${day}-${rand}`;
}

function storeDepositShare(depositAmount, platformFeeAmount) {
  const share = roundVnd(depositAmount) - roundVnd(platformFeeAmount);
  if (!Number.isFinite(share) || share < 0) {
    return { ok: false, code: 'STORE_DEPOSIT_SHORT', storeDepositAmount: share };
  }
  return { ok: true, code: null, storeDepositAmount: share };
}

function priceMaterialOrder({ materialSubtotal, shippingFee }) {
  const { snapshotMaterialFree } = require('./contractor-finance');
  return snapshotMaterialFree({ materialSubtotal, shippingFee });
}

function priceLegacyMaterialOrder({ materialSubtotal, shippingFee }) {
  const subtotal = roundVnd(materialSubtotal);
  const shipping = roundVnd(shippingFee);
  const totalAmount = subtotal + shipping;
  const platformFeeAmount = roundVnd(subtotal * LEGACY_PLATFORM_FEE_RATE);
  const depositAmount = roundVnd(totalAmount * LEGACY_DEPOSIT_RATE);
  const share = storeDepositShare(depositAmount, platformFeeAmount);
  const storeDepositAmount = share.storeDepositAmount;
  const remainingAmount = totalAmount - depositAmount;
  const priced = {
    materialSubtotal: subtotal,
    shippingFee: shipping,
    totalAmount,
    depositRateSnapshot: 15,
    depositAmount,
    platformFeeRateSnapshot: 5,
    platformFeeAmount,
    storeDepositAmount,
    remainingAmount,
  };
  if (!share.ok || subtotal < 0 || shipping < 0 || depositAmount > totalAmount || remainingAmount < 0) {
    return { ok: false, code: 'STORE_DEPOSIT_SHORT', ...priced };
  }
  return { ok: true, code: null, ...priced };
}

function materialCommissionSnapshot(order) {
  const platformAmount = roundVnd(order?.platformFeeAmount);
  const storeAmount = roundVnd(order?.storeDepositAmount);
  const rateSnapshot = Number(order?.platformFeeRateSnapshot);
  if (!Number.isFinite(rateSnapshot) || platformAmount < 0 || storeAmount < 0) {
    throw new ApiError(422, 'Deposit does not cover the platform fee');
  }
  return { rateSnapshot, platformAmount, storeAmount };
}

function assertMaterialStatusTransition(current, next, actor) {
  const allowed = TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new ApiError(409, 'Invalid material order status change');
  }
  const actorAllowed = (ACTOR_MOVES[actor] || {})[current] || [];
  if (!actorAllowed.includes(next)) {
    throw new ApiError(403, 'You cannot change this material order status');
  }
}

module.exports = {
  PLATFORM_FEE_RATE,
  DEPOSIT_RATE,
  LEGACY_PLATFORM_FEE_RATE,
  LEGACY_DEPOSIT_RATE,
  priceLegacyMaterialOrder,
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  TRANSITIONS,
  STORE_CANCELLABLE_STATUSES,
  generateMaterialOrderCode,
  priceMaterialOrder,
  materialCommissionSnapshot,
  storeDepositShare,
  assertMaterialStatusTransition,
  nextStoreFulfillment,
  summarizeMaterialEarnings,
  materialStatusNotice,
  storeCancelNotice,
};
