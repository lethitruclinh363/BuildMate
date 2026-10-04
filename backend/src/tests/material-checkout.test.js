const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { distanceKm } = require('../utils/geo');
const { summarizeMaterialCheckout } = require('../utils/material-checkout');
const { checkoutQuoteSchema } = require('../validators/material-checkout.validator');

const policy = {
  deliveryEnabled: true,
  serviceRadiusKm: 10,
  baseDeliveryFee: 30000,
  freeDeliveryRadiusKm: 2,
  deliveryFeePerKm: 8000,
  minimumOrderAmount: 200000,
};

describe('material checkout distance and deposit', () => {
  it('measures zero between the same point', () => {
    const point = { lat: 10.045, lng: 105.746 };
    assert.equal(distanceKm(point, point), 0);
  });

  it('measures about one kilometre due north', () => {
    const km = distanceKm({ lat: 10.045, lng: 105.746 }, { lat: 10.045 + 1 / 111.195, lng: 105.746 });
    assert.ok(Math.abs(km - 1) < 0.02);
  });

  it('quotes the phase 1 fee and a 15 percent deposit from the server subtotal', () => {
    const quote = summarizeMaterialCheckout({ policy, distanceKm: 7, materialSubtotal: 200000 });
    assert.equal(quote.ok, true);
    assert.equal(quote.chargeableDistanceKm, 5);
    assert.equal(quote.shippingFee, 70000);
    assert.equal(quote.orderTotal, 270000);
    assert.equal(quote.depositAmount, 40500);
    assert.equal(quote.remainingAmount, 229500);
    assert.equal(quote.depositAmount + quote.remainingAmount, quote.orderTotal);
  });

  it('rounds a fractional shipping fee to whole VND', () => {
    const quote = summarizeMaterialCheckout({ policy, distanceKm: 2.126, materialSubtotal: 200000 });
    assert.equal(quote.shippingFee, 31008);
    assert.equal(quote.orderTotal, 231008);
    assert.equal(quote.depositAmount, 34651);
    assert.equal(quote.remainingAmount, quote.orderTotal - quote.depositAmount);
  });

  it('blocks delivery outside the service radius', () => {
    const quote = summarizeMaterialCheckout({ policy, distanceKm: 10.1, materialSubtotal: 500000 });
    assert.equal(quote.ok, false);
    assert.equal(quote.code, 'OUT_OF_RANGE');
    assert.equal(quote.serviceRadiusKm, 10);
    assert.equal(quote.shippingFee, null);
    assert.equal(quote.depositAmount, null);
  });

  it('blocks a disabled delivery policy', () => {
    const quote = summarizeMaterialCheckout({
      policy: { ...policy, deliveryEnabled: false },
      distanceKm: 1,
      materialSubtotal: 500000,
    });
    assert.equal(quote.code, 'DELIVERY_DISABLED');
    assert.equal(quote.ok, false);
  });

  it('rejects a client price, shipping fee, or total on the quote payload', () => {
    const body = {
      storeId: '64b000000000000000000001',
      address: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      items: [{ materialId: '64b000000000000000000002', quantity: 2, price: 1 }],
      shippingFee: 0,
      orderTotal: 0,
      depositAmount: 0,
    };
    const parsed = checkoutQuoteSchema.safeParse(body);
    assert.equal(parsed.success, false);
  });

  it('blocks a subtotal under the store minimum after shipping is known', () => {
    const quote = summarizeMaterialCheckout({ policy, distanceKm: 7, materialSubtotal: 150000 });
    assert.equal(quote.ok, false);
    assert.equal(quote.code, 'BELOW_MINIMUM');
    assert.equal(quote.shippingFee, 70000);
    assert.equal(quote.orderTotal, 220000);
    assert.equal(quote.minimumOrderAmount, 200000);
  });
});
