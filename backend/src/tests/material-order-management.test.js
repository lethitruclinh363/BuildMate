const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../utils/ApiError');
const {
  nextStoreFulfillment,
  summarizeMaterialEarnings,
  materialStatusNotice,
  assertMaterialStatusTransition,
  MATERIAL_ACTOR,
} = require('../utils/material-order.rules');

const paid = {
  status: 'DEPOSIT_PAID',
  totalAmount: 2200000,
  depositAmount: 330000,
  platformFeeAmount: 100000,
  storeDepositAmount: 230000,
  remainingAmount: 1870000,
};

describe('material order management', () => {
  it('moves a store order one step at a time', () => {
    assert.equal(nextStoreFulfillment('PENDING_CONFIRMATION'), 'CONFIRMED');
    assert.equal(nextStoreFulfillment('DEPOSIT_PAID'), 'CONFIRMED');
    assert.equal(nextStoreFulfillment('CONFIRMED'), 'PREPARING');
    assert.equal(nextStoreFulfillment('PREPARING'), 'READY_FOR_DELIVERY');
    assert.equal(nextStoreFulfillment('READY_FOR_DELIVERY'), 'DELIVERING');
    assert.equal(nextStoreFulfillment('DELIVERING'), 'DELIVERED');
    assert.equal(nextStoreFulfillment('DELIVERED'), null);
    assert.throws(
      () => assertMaterialStatusTransition('DEPOSIT_PAID', 'DELIVERING', MATERIAL_ACTOR.STORE),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
    assert.throws(
      () => assertMaterialStatusTransition('PREPARING', 'CONFIRMED', MATERIAL_ACTOR.STORE),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
  });

  it('completes the order when the customer confirms receipt', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('DELIVERED', 'CUSTOMER_RECEIVED', MATERIAL_ACTOR.CUSTOMER)
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('CUSTOMER_RECEIVED', 'COMPLETED', MATERIAL_ACTOR.SYSTEM)
    );
    assert.throws(
      () => assertMaterialStatusTransition('DELIVERED', 'COMPLETED', MATERIAL_ACTOR.CUSTOMER),
      (err) => err instanceof ApiError && err.statusCode === 409
    );
  });

  it('sums completed material GMV and does not treat it as platform revenue', () => {
    const summary = summarizeMaterialEarnings([
      paid,
      { ...paid, status: 'COMPLETED' },
      { ...paid, status: 'PENDING_CONFIRMATION' },
      { ...paid, status: 'PENDING_PAYMENT' },
      { ...paid, status: 'CANCELLED' },
    ]);
    assert.equal(summary.orderValue, 2_200_000);
    assert.equal(summary.onlineDeposits, 0);
    assert.equal(summary.platformFees, 0);
    assert.equal(summary.storeDeposits, 0);
    assert.equal(summary.directRemaining, 3_740_000);
  });

  it('notifies the other party only on the agreed steps', () => {
    assert.equal(materialStatusNotice('CONFIRMED', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('DELIVERING', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('DELIVERED', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('CUSTOMER_RECEIVED', 'VL-1').audience, 'store');
    assert.equal(materialStatusNotice('PREPARING', 'VL-1'), null);
    assert.equal(materialStatusNotice('COMPLETED', 'VL-1'), null);
  });
});
