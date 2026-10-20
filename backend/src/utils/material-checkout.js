const { quoteDelivery } = require('./delivery-policy');

const DEPOSIT_RATE = 0;

function roundVnd(value) {
  return Math.round(Number(value) || 0);
}

function roundKm(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return null;
  return Math.round(distance * 100) / 100;
}

/**
 * Money is derived only from the store policy, server distance, and the
 * material subtotal already priced from the database.
 */
function summarizeMaterialCheckout({ policy, distanceKm, materialSubtotal }) {
  const distance = Number(distanceKm);
  const subtotal = roundVnd(materialSubtotal);
  const quoted = quoteDelivery(policy, distance);
  const base = {
    distanceKm: roundKm(distance),
    serviceRadiusKm: policy.serviceRadiusKm,
    minimumOrderAmount: policy.minimumOrderAmount,
    materialSubtotal: subtotal,
    depositRate: DEPOSIT_RATE,
  };

  if (!quoted.deliverable) {
    return {
      ...base,
      ok: false,
      code: quoted.reason,
      chargeableDistanceKm: null,
      shippingFee: null,
      orderTotal: null,
      depositAmount: null,
      remainingAmount: null,
    };
  }

  const shippingFee = roundVnd(quoted.shippingFee);
  const orderTotal = subtotal + shippingFee;
  const depositAmount = 0;
  const remainingAmount = orderTotal;
  const money = {
    chargeableDistanceKm: roundKm(quoted.chargeableDistanceKm),
    shippingFee,
    orderTotal,
    depositAmount,
    remainingAmount,
  };

  if (subtotal < policy.minimumOrderAmount) {
    return { ...base, ...money, ok: false, code: 'BELOW_MINIMUM' };
  }

  return { ...base, ...money, ok: true, code: null };
}

module.exports = { DEPOSIT_RATE, roundVnd, summarizeMaterialCheckout };
