const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../utils/ApiError');
const { summarizeMaterialCheckout } = require('../utils/material-checkout');
const {
  priceMaterialOrder,
  priceLegacyMaterialOrder,
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
  it('prices new material orders as goods plus shipping with zero platform fee', () => {
    const summary = summarizeMaterialCheckout({ policy, distanceKm: 7, materialSubtotal: 200000 });
    const priced = priceMaterialOrder(summary);
    assert.equal(priced.ok, true);
    assert.equal(priced.shippingFee, 70000);
    assert.equal(priced.totalAmount, 270000);
    assert.equal(priced.platformFeeAmount, 0);
    assert.equal(priced.depositAmount, 0);
    assert.equal(priced.storeDepositAmount, 0);
    assert.equal(priced.remainingAmount, 270000);
    assert.equal(priced.depositRateSnapshot, 0);
    assert.equal(priced.platformFeeRateSnapshot, 0);
    assert.equal(priced.paymentMethod, 'COD');
  });

  it('rejects negative goods or shipping on the free policy', () => {
    const share = storeDepositShare(1000, 4000);
    assert.equal(share.ok, false);
    assert.equal(share.code, 'STORE_DEPOSIT_SHORT');
    assert.equal(share.storeDepositAmount, -3000);
    const priced = priceMaterialOrder({ materialSubtotal: -1, shippingFee: 0 });
    assert.equal(priced.ok, false);
    assert.equal(priced.code, 'INVALID_AMOUNT');
  });

  it('matches 2_000_000 goods plus 100_000 shipping with no BuildMate fee', () => {
    const priced = priceMaterialOrder({ materialSubtotal: 2_000_000, shippingFee: 100_000 });
    assert.equal(priced.ok, true);
    assert.equal(priced.totalAmount, 2_100_000);
    assert.equal(priced.depositAmount, 0);
    assert.equal(priced.platformFeeAmount, 0);
    assert.equal(priced.storeDepositAmount, 0);
    assert.equal(priced.remainingAmount, 2_100_000);
  });

  it('keeps the legacy 15/5 snapshot for historical material orders', () => {
    const priced = priceLegacyMaterialOrder({ materialSubtotal: 2_000_000, shippingFee: 200_000 });
    assert.equal(priced.totalAmount, 2_200_000);
    assert.equal(priced.depositAmount, 330_000);
    assert.equal(priced.platformFeeAmount, 100_000);
    assert.equal(priced.storeDepositAmount, 230_000);
    assert.equal(priced.remainingAmount, 1_870_000);
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
      assertMaterialStatusTransition('PENDING_CONFIRMATION', 'CONFIRMED', MATERIAL_ACTOR.STORE)
    );
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
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PENDING_CONFIRMATION', 'CANCELLED', MATERIAL_ACTOR.CUSTOMER)
    );
    assert.throws(
      () => assertMaterialStatusTransition('PREPARING', 'CANCELLED', MATERIAL_ACTOR.CUSTOMER),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
  });
});
