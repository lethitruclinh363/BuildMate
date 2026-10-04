const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../utils/ApiError');
const { summarizeMaterialCheckout } = require('../utils/material-checkout');
const {
  priceMaterialOrder,
  storeDepositShare,
  assertMaterialStatusTransition,
  MATERIAL_ACTOR,
  generateMaterialOrderCode,
} = require('../utils/material-order.rules');
const { createMaterialOrderSchema } = require('../validators/material-order.validator');

const policy = {
  deliveryEnabled: true,
  serviceRadiusKm: 10,
  baseDeliveryFee: 30000,
  freeDeliveryRadiusKm: 2,
  deliveryFeePerKm: 8000,
  minimumOrderAmount: 200000,
};

describe('material order pricing and status', () => {
  it('takes a 5 percent platform fee from the material subtotal only', () => {
    const summary = summarizeMaterialCheckout({ policy, distanceKm: 7, materialSubtotal: 200000 });
    const priced = priceMaterialOrder(summary);
    assert.equal(priced.ok, true);
    assert.equal(priced.shippingFee, 70000);
    assert.equal(priced.totalAmount, 270000);
    assert.equal(priced.platformFeeAmount, 10000);
    assert.equal(priced.depositAmount, 40500);
    assert.equal(priced.storeDepositAmount, 30500);
    assert.equal(priced.remainingAmount, 229500);
    assert.equal(priced.depositRateSnapshot, 15);
    assert.equal(priced.platformFeeRateSnapshot, 5);
    assert.equal(priced.depositAmount + priced.remainingAmount, priced.totalAmount);
  });

  it('rejects a store deposit that would be negative', () => {
    const share = storeDepositShare(1000, 4000);
    assert.equal(share.ok, false);
    assert.equal(share.code, 'STORE_DEPOSIT_SHORT');
    assert.equal(share.storeDepositAmount, -3000);
    const priced = priceMaterialOrder({ materialSubtotal: -1, shippingFee: 0 });
    assert.equal(priced.ok, false);
    assert.equal(priced.code, 'STORE_DEPOSIT_SHORT');
  });

  it('matches the deposit example without charging the platform fee on shipping', () => {
    const priced = priceMaterialOrder({ materialSubtotal: 2000000, shippingFee: 200000 });
    assert.equal(priced.totalAmount, 2200000);
    assert.equal(priced.depositAmount, 330000);
    assert.equal(priced.platformFeeAmount, 100000);
    assert.equal(priced.storeDepositAmount, 230000);
    assert.equal(priced.remainingAmount, 1870000);
    assert.notEqual(priced.platformFeeAmount, Math.round(priced.depositAmount * 0.05));
  });

  it('issues a material order code separate from repair orders', () => {
    assert.match(generateMaterialOrderCode(), /^VL-\d{8}-[A-F0-9]{6}$/);
  });

  it('rejects client money fields on create', () => {
    const parsed = createMaterialOrderSchema.safeParse({
      storeId: '64b000000000000000000001',
      deliveryAddress: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      items: [{ materialId: '64b000000000000000000002', quantity: 2 }],
      totalAmount: 1,
      shippingFee: 0,
      depositAmount: 0,
    });
    assert.equal(parsed.success, false);
  });

  it('lets only the system mark a deposit as paid', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PENDING_PAYMENT', 'DEPOSIT_PAID', MATERIAL_ACTOR.SYSTEM)
    );
    assert.throws(
      () => assertMaterialStatusTransition('PENDING_PAYMENT', 'DEPOSIT_PAID', MATERIAL_ACTOR.STORE),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
  });

  it('walks store fulfillment forward and blocks skips', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('DEPOSIT_PAID', 'CONFIRMED', MATERIAL_ACTOR.STORE)
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('CONFIRMED', 'PREPARING', MATERIAL_ACTOR.STORE)
    );
    assert.throws(
      () => assertMaterialStatusTransition('CONFIRMED', 'DELIVERED', MATERIAL_ACTOR.STORE),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
    assert.throws(
      () => assertMaterialStatusTransition('COMPLETED', 'PREPARING', MATERIAL_ACTOR.STORE),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
  });

  it('lets the customer receive a delivered order and cancel only before payment', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('DELIVERED', 'CUSTOMER_RECEIVED', MATERIAL_ACTOR.CUSTOMER)
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PENDING_PAYMENT', 'CANCELLED', MATERIAL_ACTOR.CUSTOMER)
    );
    assert.throws(
      () => assertMaterialStatusTransition('PREPARING', 'CANCELLED', MATERIAL_ACTOR.CUSTOMER),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
  });
});
