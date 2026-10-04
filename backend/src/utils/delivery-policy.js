const { ApiError } = require('./ApiError');

function pick(store, patch, key, fallback) {
  if (patch[key] !== undefined && patch[key] !== null) return patch[key];
  if (store && store[key] !== undefined && store[key] !== null) return store[key];
  return fallback;
}

function normalizeDeliveryPolicy(store = {}, patch = {}) {
  return {
    deliveryEnabled: Boolean(pick(store, patch, 'deliveryEnabled', false)),
    serviceRadiusKm: Number(pick(store, patch, 'serviceRadiusKm', 5)),
    baseDeliveryFee: Number(pick(store, patch, 'baseDeliveryFee', 0)),
    freeDeliveryRadiusKm: Number(pick(store, patch, 'freeDeliveryRadiusKm', 0)),
    deliveryFeePerKm: Number(pick(store, patch, 'deliveryFeePerKm', 0)),
    minimumOrderAmount: Number(pick(store, patch, 'minimumOrderAmount', 0)),
  };
}

function assertDeliveryPolicy(store, patch = {}) {
  const policy = normalizeDeliveryPolicy(store, patch);
  if (
    [policy.baseDeliveryFee, policy.deliveryFeePerKm, policy.minimumOrderAmount, policy.freeDeliveryRadiusKm].some(
      (value) => !Number.isFinite(value) || value < 0
    )
  ) {
    throw new ApiError(422, 'Delivery fees must be zero or greater');
  }
  if (!Number.isFinite(policy.serviceRadiusKm) || policy.serviceRadiusKm < 1 || policy.serviceRadiusKm > 50) {
    throw new ApiError(422, 'Delivery radius must be between 1 and 50 km');
  }
  if (policy.freeDeliveryRadiusKm > policy.serviceRadiusKm) {
    throw new ApiError(422, 'Free delivery radius cannot exceed the service radius');
  }
  return policy;
}

function quoteDelivery(policy, distanceKm) {
  const distance = Number(distanceKm);
  if (!policy.deliveryEnabled) {
    return { deliverable: false, reason: 'DELIVERY_DISABLED', chargeableDistanceKm: null, shippingFee: null };
  }
  if (!Number.isFinite(distance) || distance < 0 || distance > policy.serviceRadiusKm) {
    return { deliverable: false, reason: 'OUT_OF_RANGE', chargeableDistanceKm: null, shippingFee: null };
  }
  const chargeableDistanceKm = Math.max(distance - policy.freeDeliveryRadiusKm, 0);
  const shippingFee = policy.baseDeliveryFee + chargeableDistanceKm * policy.deliveryFeePerKm;
  return { deliverable: true, reason: null, chargeableDistanceKm, shippingFee };
}

module.exports = { normalizeDeliveryPolicy, assertDeliveryPolicy, quoteDelivery };
