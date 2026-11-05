const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { quoteDelivery } = require('../utils/delivery-policy');

const standardPolicy = {
  deliveryEnabled: true,
  serviceRadiusKm: 10,
  baseDeliveryFee: 30000,
  freeDeliveryRadiusKm: 2,
  deliveryFeePerKm: 8000,
};

describe('UT-17: quoteDelivery — Material Delivery Fee & Feasibility Calculation', () => {
  it('UTCID01 (Normal): calculates shipping fee beyond free delivery radius correctly', () => {
    const result = quoteDelivery(standardPolicy, 7);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 5); // 7km - 2km = 5km
    assert.equal(result.shippingFee, 70000); // 30,000 + 5 * 8,000 = 70,000
  });

  it('UTCID02 (Normal): charges only base delivery fee when distance is inside free radius', () => {
    const result = quoteDelivery(standardPolicy, 1.5);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 0); // 1.5km < 2km -> 0km
    assert.equal(result.shippingFee, 30000); // base fee only
  });

  it('UTCID03 (Normal): charges base delivery fee for distance 0 km (immediate vicinity / store pickup)', () => {
    const result = quoteDelivery(standardPolicy, 0);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 0);
    assert.equal(result.shippingFee, 30000);
  });

  it('UTCID04 (Normal): charges entire distance when store has zero free delivery radius', () => {
    const policyNoFree = { ...standardPolicy, freeDeliveryRadiusKm: 0 };
    const result = quoteDelivery(policyNoFree, 5);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 5); // 5km - 0km = 5km
    assert.equal(result.shippingFee, 70000); // 30,000 + 5 * 8,000 = 70,000
  });

  it('UTCID05 (Normal): correctly coerces string numeric distance input to number', () => {
    const result = quoteDelivery(standardPolicy, '6');

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 4); // 6km - 2km = 4km
    assert.equal(result.shippingFee, 62000); // 30,000 + 4 * 8,000 = 62,000
  });

  it('UTCID06 (Boundary): accepts distance exactly at service radius limit (10 km)', () => {
    const result = quoteDelivery(standardPolicy, 10);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 8); // 10km - 2km = 8km
    assert.equal(result.shippingFee, 94000); // 30,000 + 8 * 8,000 = 94,000
  });

  it('UTCID07 (Boundary): charges only base fee when distance is exactly at free radius limit (2 km)', () => {
    const result = quoteDelivery(standardPolicy, 2);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 0); // 2km - 2km = 0km
    assert.equal(result.shippingFee, 30000);
  });

  it('UTCID08 (Boundary): calculates accurately with fractional / decimal distance (4.5 km)', () => {
    const result = quoteDelivery(standardPolicy, 4.5);

    assert.equal(result.deliverable, true);
    assert.equal(result.reason, null);
    assert.equal(result.chargeableDistanceKm, 2.5); // 4.5km - 2km = 2.5km
    assert.equal(result.shippingFee, 50000); // 30,000 + 2.5 * 8,000 = 50,000
  });

  it('UTCID09 (Abnormal): returns DELIVERY_DISABLED when store delivery is turned off', () => {
    const policyDisabled = { ...standardPolicy, deliveryEnabled: false };
    const result = quoteDelivery(policyDisabled, 5);

    assert.equal(result.deliverable, false);
    assert.equal(result.reason, 'DELIVERY_DISABLED');
    assert.equal(result.chargeableDistanceKm, null);
    assert.equal(result.shippingFee, null);
  });

  it('UTCID10 (Abnormal): returns OUT_OF_RANGE when distance exceeds service radius', () => {
    const result = quoteDelivery(standardPolicy, 10.1); // > 10 km limit

    assert.equal(result.deliverable, false);
    assert.equal(result.reason, 'OUT_OF_RANGE');
    assert.equal(result.chargeableDistanceKm, null);
    assert.equal(result.shippingFee, null);
  });

  it('UTCID11 (Abnormal): returns OUT_OF_RANGE for negative distance value', () => {
    const result = quoteDelivery(standardPolicy, -1);

    assert.equal(result.deliverable, false);
    assert.equal(result.reason, 'OUT_OF_RANGE');
    assert.equal(result.chargeableDistanceKm, null);
    assert.equal(result.shippingFee, null);
  });

  it('UTCID12 (Abnormal): returns OUT_OF_RANGE for non-numeric NaN distance input', () => {
    const result = quoteDelivery(standardPolicy, 'invalid_distance');

    assert.equal(result.deliverable, false);
    assert.equal(result.reason, 'OUT_OF_RANGE');
    assert.equal(result.chargeableDistanceKm, null);
    assert.equal(result.shippingFee, null);
  });
});

