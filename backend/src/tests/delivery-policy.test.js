const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertDeliveryPolicy, quoteDelivery } = require('../utils/delivery-policy');

const sample = {
  deliveryEnabled: true,
  serviceRadiusKm: 10,
  baseDeliveryFee: 30000,
  freeDeliveryRadiusKm: 2,
  deliveryFeePerKm: 8000,
  minimumOrderAmount: 200000,
};

describe('material store delivery policy', () => {
  it('charges the base fee plus each kilometre beyond the free radius', () => {
    const quote = quoteDelivery(sample, 7);
    assert.equal(quote.deliverable, true);
    assert.equal(quote.chargeableDistanceKm, 5);
    assert.equal(quote.shippingFee, 70000);
  });

  it('charges only the base fee inside the free radius', () => {
    const quote = quoteDelivery(sample, 2);
    assert.equal(quote.chargeableDistanceKm, 0);
    assert.equal(quote.shippingFee, 30000);
  });

  it('refuses delivery outside the service radius', () => {
    const quote = quoteDelivery(sample, 10.1);
    assert.equal(quote.deliverable, false);
    assert.equal(quote.reason, 'OUT_OF_RANGE');
    assert.equal(quote.shippingFee, null);
  });

  it('refuses delivery when the store has turned it off', () => {
    const quote = quoteDelivery({ ...sample, deliveryEnabled: false }, 1);
    assert.equal(quote.reason, 'DELIVERY_DISABLED');
  });

  it('rejects a free radius larger than the service radius', () => {
    assert.throws(
      () => assertDeliveryPolicy({ serviceRadiusKm: 10, freeDeliveryRadiusKm: 0 }, { freeDeliveryRadiusKm: 12 }),
      (err) => err.statusCode === 422
    );
  });

  it('keeps a same-radius free zone', () => {
    const policy = assertDeliveryPolicy(sample, { freeDeliveryRadiusKm: 10 });
    assert.equal(policy.freeDeliveryRadiusKm, 10);
  });
});
