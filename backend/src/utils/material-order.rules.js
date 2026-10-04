const crypto = require('crypto');
const { ApiError } = require('./ApiError');
const { roundVnd } = require('./material-checkout');

const PLATFORM_FEE_RATE = 0.05;
const DEPOSIT_RATE = 0.15;

const MATERIAL_ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
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
    DEPOSIT_PAID: Object.freeze(['CONFIRMED', 'CANCELLED']),
    CONFIRMED: Object.freeze(['PREPARING', 'CANCELLED']),
    PREPARING: Object.freeze(['READY_FOR_DELIVERY', 'CANCELLED']),
    READY_FOR_DELIVERY: Object.freeze(['DELIVERING', 'CANCELLED']),
    DELIVERING: Object.freeze(['DELIVERED']),
    CUSTOMER_RECEIVED: Object.freeze(['COMPLETED']),
  }),
  CUSTOMER: Object.freeze({
    PENDING_PAYMENT: Object.freeze(['CANCELLED']),
    DELIVERED: Object.freeze(['CUSTOMER_RECEIVED']),
  }),
});

const STORE_FORWARD = Object.freeze({
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
    (order) => order.status !== MATERIAL_ORDER_STATUS.PENDING_PAYMENT && order.status !== MATERIAL_ORDER_STATUS.CANCELLED
  );
  const sum = (key) => counted.reduce((total, order) => total + roundVnd(order[key]), 0);
  return {
    orderValue: sum('totalAmount'),
    onlineDeposits: sum('depositAmount'),
    platformFees: sum('platformFeeAmount'),
    storeDeposits: sum('storeDepositAmount'),
    directRemaining: sum('remainingAmount'),
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
  const subtotal = roundVnd(materialSubtotal);
  const shipping = roundVnd(shippingFee);
  const totalAmount = subtotal + shipping;
  const platformFeeAmount = roundVnd(subtotal * PLATFORM_FEE_RATE);
  const depositAmount = roundVnd(totalAmount * DEPOSIT_RATE);
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
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  TRANSITIONS,
  generateMaterialOrderCode,
  priceMaterialOrder,
  materialCommissionSnapshot,
  storeDepositShare,
  assertMaterialStatusTransition,
  nextStoreFulfillment,
  summarizeMaterialEarnings,
  materialStatusNotice,
};
