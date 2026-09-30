const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ORDER_STATUS,
  PROGRESS_STATUS,
  generateOrderCode,
  orderStatusAfterProgress,
} = require('../utils/order.rules');

describe('order business rules', () => {
  it('generates a unique-looking BM order code', () => {
    const code = generateOrderCode();
    assert.match(code, /^BM-\d{8}-[A-F0-9]{6}$/);
    assert.notEqual(generateOrderCode(), generateOrderCode());
  });

  it('maps progress stages onto the repair job state machine', () => {
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.QUOTATION_ACCEPTED, PROGRESS_STATUS.STARTED),
      ORDER_STATUS.STARTED
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.STARTED, PROGRESS_STATUS.IN_PROGRESS),
      ORDER_STATUS.IN_PROGRESS
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.IN_PROGRESS),
      ORDER_STATUS.IN_PROGRESS
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.COMPLETED),
      ORDER_STATUS.COMPLETED
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.COMPLETED, PROGRESS_STATUS.COMPLETED),
      ORDER_STATUS.COMPLETED
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.CUSTOMER_ACCEPTED, PROGRESS_STATUS.COMPLETED),
      ORDER_STATUS.CUSTOMER_ACCEPTED
    );
  });
});
