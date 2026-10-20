const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scoreReputation, materialScoreInput } = require('../services/reputationScore');

function history(status, extra = {}) {
  return {
    status,
    actor_role: extra.actor || 'STORE',
    note: extra.note || '',
    created_at: extra.at || '2026-02-02T00:00:00.000Z',
  };
}

function row(overrides = {}) {
  return {
    id: overrides.id || '1',
    order_code: overrides.orderCode || 'VL-1',
    customer_user_id: 'customer',
    store_owner_user_id: 'store',
    payment_status: overrides.payment || 'PAID',
    status: overrides.status || 'COMPLETED',
    customer_note: overrides.note || '',
    customer_email: overrides.email || 'khach@example.vn',
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: overrides.updatedAt || '2026-02-03T00:00:00.000Z',
    material_order_status_history: overrides.history || [
      history('DEPOSIT_PAID', { actor: 'SYSTEM', at: '2026-02-01T01:00:00.000Z' }),
      history('CONFIRMED', { note: overrides.eta || '', at: '2026-02-01T02:00:00.000Z' }),
      history('DELIVERED', { at: overrides.deliveredAt || '2026-02-02T00:00:00.000Z' }),
      history('CUSTOMER_RECEIVED', { actor: 'CUSTOMER', at: '2026-02-02T06:00:00.000Z' }),
      history('COMPLETED', { actor: 'SYSTEM', at: '2026-02-02T06:00:01.000Z' }),
    ],
  };
}

function review(orderId, rating = 5) {
  return { material_order_id: orderId, rating, created_at: '2026-02-04T00:00:00.000Z' };
}

function scored(rows, reviews) {
  return scoreReputation(materialScoreInput(rows, reviews));
}

describe('material store reputation', () => {
  it('hides the score when the store has no paid orders', () => {
    const result = scored([
      row({ id: 'pending', payment: 'UNPAID', status: 'PENDING_PAYMENT', history: [history('PENDING_PAYMENT', { actor: 'CUSTOMER' })] }),
    ], []);
    assert.equal(result.published, false);
    assert.equal(result.score, null);
    assert.equal(result.status, 'INSUFFICIENT');
    assert.equal(result.validOrders, 0);
  });

  it('does not publish with fewer than 3 reviews', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({ id: String(id) }));
    const result = scored(orders, [review('1', 5), review('2', 4)]);
    assert.equal(result.published, false);
    assert.equal(result.score, null);
    assert.equal(result.validOrders, 5);
    assert.equal(result.reviews.count, 2);
    assert.equal(result.reviews.average, 4.5);
  });

  it('publishes the shared formula after enough completed orders and reviews', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({ id: String(id), eta: '2026-02-03T00:00:00.000Z' }));
    const result = scored(orders, [review('1'), review('2'), review('3')]);
    assert.equal(result.published, true);
    assert.equal(result.completion.percent, 100);
    assert.equal(result.onTime.percent, 100);
    assert.equal(result.complaints.percent, null);
    assert.equal(result.complaints.component, 5);
    assert.equal(result.score, 8.35);
    assert.equal(result.grade, 'VERY_GOOD');
    assert.ok(result.score >= 0 && result.score <= 10);
  });

  it('counts a delivery after the confirmed time as late', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({
      id: String(id),
      eta: '2026-02-01T12:00:00.000Z',
      deliveredAt: '2026-02-03T00:00:00.000Z',
    }));
    const result = scored(orders, [review('1'), review('2'), review('3')]);
    assert.equal(result.onTime.onTime, 0);
    assert.equal(result.onTime.late, 5);
    assert.equal(result.onTime.percent, 0);
    assert.ok(result.score < 8.35);
  });

  it('leaves a confirmed deadline out when the store never recorded one', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({ id: String(id), eta: 'giao trong ngày' }));
    const result = scored(orders, [review('1'), review('2'), review('3')]);
    assert.equal(result.onTime.percent, null);
    assert.equal(result.onTime.component, 5);
  });

  it('does not lower completion when the customer cancels', () => {
    const completed = [1, 2, 3, 4, 5].map((id) => row({ id: String(id) }));
    const cancelled = row({
      id: 'c',
      status: 'CANCELLED',
      history: [
        history('DEPOSIT_PAID', { actor: 'SYSTEM' }),
        history('CANCELLED', { actor: 'CUSTOMER', note: 'Đổi ý', at: '2026-02-02T00:00:00.000Z' }),
      ],
    });
    const result = scored([...completed, cancelled], [review('1'), review('2'), review('3')]);
    assert.equal(result.completion.percent, 100);
    assert.equal(result.completion.customerCancelled, 1);
    assert.equal(result.completion.contractorCancelled, 0);
    assert.equal(result.validOrders, 6);
  });

  it('records a cancellation by the store in the completion rate', () => {
    const completed = [1, 2, 3, 4].map((id) => row({ id: String(id) }));
    const cancelled = row({
      id: 's',
      status: 'CANCELLED',
      history: [
        history('DEPOSIT_PAID', { actor: 'SYSTEM' }),
        history('CANCELLED', { actor: 'STORE', note: 'Hết hàng', at: '2026-02-02T00:00:00.000Z' }),
      ],
    });
    const result = scored([...completed, cancelled], [review('1'), review('2'), review('3')]);
    assert.equal(result.completion.completed, 4);
    assert.equal(result.completion.contractorCancelled, 1);
    assert.equal(result.completion.percent, 80);
  });

  it('keeps an open incident out of the rate and does not award a perfect complaint score', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({
      id: String(id),
      history: [
        history('DEPOSIT_PAID', { actor: 'SYSTEM' }),
        history('DELIVERED'),
        history('COMPLETED', { actor: 'SYSTEM', note: 'ISSUE:OPEN' }),
      ],
    }));
    const result = scored(orders, [review('1'), review('2'), review('3')]);
    assert.equal(result.complaints.open, 5);
    assert.equal(result.complaints.percent, null);
    assert.equal(result.complaints.component, 5);
  });

  it('uses the latest handling status once per order', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({
      id: String(id),
      history: [
        history('DEPOSIT_PAID', { actor: 'SYSTEM' }),
        history('DELIVERED', { note: 'ISSUE:OPEN', at: '2026-02-02T00:00:00.000Z' }),
        history('COMPLETED', { actor: 'SYSTEM', note: 'ISSUE:REJECTED', at: '2026-02-05T00:00:00.000Z' }),
      ],
    }));
    const resolved = scored(orders, [review('1'), review('2'), review('3')]);
    assert.equal(resolved.complaints.open, 0);
    assert.equal(resolved.complaints.dismissed, 5);
    assert.equal(resolved.complaints.upheld, 0);
    assert.equal(resolved.complaints.percent, 100);

    const upheld = scored(orders.map((order) => ({
      ...order,
      material_order_status_history: order.material_order_status_history.map((item) => (
        item.note === 'ISSUE:REJECTED' ? { ...item, note: 'ISSUE:RESOLVED' } : item
      )),
    })), [review('1'), review('2'), review('3')]);
    assert.equal(upheld.complaints.upheld, 5);
    assert.equal(upheld.complaints.percent, 0);
    assert.ok(upheld.score < resolved.score);
  });

  it('recalculates from the same PostgreSQL rows without storing a manual score', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => row({ id: String(id), eta: '2026-02-03T00:00:00.000Z' }));
    const reviews = [review('1'), review('2'), review('3')];
    const first = scored(orders, reviews);
    const again = scored(orders, reviews);
    assert.deepEqual(again, first);
    const withAnother = scored(orders, [...reviews, review('4', 1)]);
    assert.notEqual(withAnother.reviews.average, first.reviews.average);
    assert.notEqual(withAnother.score, first.score);
  });
});
