const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ORDER_STATUS,
  PROGRESS_STATUS,
  generateOrderCode,
  isValidProgressTransition,
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
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.STARTED, PROGRESS_STATUS.COMPLETED),
      ORDER_STATUS.STARTED
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.STARTED, PROGRESS_STATUS.STARTED),
      ORDER_STATUS.STARTED
    );
  });

  it('allows journal updates and the next stage only', () => {
    assert.equal(isValidProgressTransition(ORDER_STATUS.DEPOSIT_PAID, PROGRESS_STATUS.STARTED), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.QUOTATION_ACCEPTED, PROGRESS_STATUS.IN_PROGRESS), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.STARTED, PROGRESS_STATUS.STARTED), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.STARTED, PROGRESS_STATUS.IN_PROGRESS), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.STARTED, PROGRESS_STATUS.COMPLETED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.IN_PROGRESS), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.COMPLETED), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.STARTED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.COMPLETED, PROGRESS_STATUS.COMPLETED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.COMPLETED, PROGRESS_STATUS.IN_PROGRESS), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.CUSTOMER_ACCEPTED, PROGRESS_STATUS.IN_PROGRESS), false);
  });
});
