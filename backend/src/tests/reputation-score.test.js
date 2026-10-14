const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scoreReputation, starComponent } = require('../services/reputationScore');

function order(overrides) {
  return {
    id: '1',
    status: 'CUSTOMER_ACCEPTED',
    customerId: 'customer',
    contractorId: 'crew',
    cancelledBy: null,
    cancelReason: '',
    customerEmail: 'khach@example.vn',
    orderCode: 'BM-1',
    title: 'Sửa mái',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    estimatedDays: 3,
    ...overrides,
  };
}

function review(orderId, rating, createdAt = '2026-01-03T00:00:00.000Z') {
  return { orderId, rating, createdAt };
}

describe('contractor reputation score', () => {
  it('hides the official score for a new crew', () => {
    const result = scoreReputation({});
    assert.equal(result.published, false);
    assert.equal(result.score, null);
    assert.equal(result.grade, null);
    assert.equal(result.status, 'INSUFFICIENT');
    assert.equal(result.reviews.count, 0);
    assert.equal(result.reviews.average, null);
    assert.equal(result.completion.percent, null);
    assert.equal(result.onTime.percent, null);
    assert.equal(result.complaints.percent, null);
    assert.equal(result.updatedAt, null);
  });

  it('does not publish below 3 reviews or 5 valid orders', () => {
    const orders = [1, 2, 3, 4].map((id) => order({ id: String(id) }));
    const result = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5)],
    });
    assert.equal(result.published, false);
    assert.equal(result.score, null);
    assert.equal(result.validOrders, 4);
    assert.equal(result.reviews.count, 2);
    assert.equal(result.reviews.average, 5);
  });

  it('does not turn a single 5-star review into 10', () => {
    assert.equal(starComponent(5, 1), 7.27);
    assert.notEqual(starComponent(5, 1), 10);
  });

  it('publishes a rounded score once the crew has enough history', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => order({ id: String(id) }));
    const result = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5)],
    });
    assert.equal(result.published, true);
    assert.equal(result.reviews.component, 7.69);
    assert.equal(result.completion.percent, 100);
    assert.equal(result.onTime.percent, 100);
    assert.equal(result.complaints.percent, null);
    assert.equal(result.complaints.component, 5);
    assert.equal(result.score, 8.35);
    assert.equal(result.grade, 'VERY_GOOD');
  });

  it('changes the review component when another review arrives', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => order({ id: String(id) }));
    const before = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5)],
    });
    const after = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5), review('4', 5, '2026-02-01T00:00:00.000Z')],
    });
    assert.equal(before.score, 8.35);
    assert.equal(after.reviews.count, 4);
    assert.equal(after.reviews.average, 5);
    assert.equal(after.score, 8.43);
    assert.notEqual(before.score, after.score);
  });

  it('raises completion when a job is accepted and ignores a customer cancellation', () => {
    const base = [1, 2, 3, 4].map((id) => order({ id: String(id) }));
    const open = order({ id: '5', status: 'IN_PROGRESS', completedAt: null });
    const before = scoreReputation({
      orders: [...base, open],
      reviews: [review('1', 4), review('2', 4), review('3', 4)],
    });
    const finished = scoreReputation({
      orders: [...base, order({ id: '5' })],
      reviews: [review('1', 4), review('2', 4), review('3', 4)],
    });
    const customerCancel = scoreReputation({
      orders: [
        ...base,
        order({ id: '5' }),
        order({
          id: '6',
          status: 'CANCELLED',
          cancelledBy: 'customer',
          customerId: 'customer',
          completedAt: null,
        }),
      ],
      reviews: [review('1', 4), review('2', 4), review('3', 4)],
    });
    assert.equal(before.completion.completed, 4);
    assert.equal(before.completion.percent, 100);
    assert.equal(finished.completion.completed, 5);
    assert.equal(finished.validOrders, 5);
    assert.equal(customerCancel.completion.percent, finished.completion.percent);
    assert.equal(customerCancel.completion.customerCancelled, 1);
    assert.equal(customerCancel.score, finished.score);
  });

  it('lowers completion only when the crew cancels', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => order({ id: String(id) }));
    orders.push(order({
      id: '6',
      status: 'CANCELLED',
      cancelledBy: 'crew',
      contractorId: 'crew',
      completedAt: null,
    }));
    const result = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5)],
    });
    assert.equal(result.completion.contractorCancelled, 1);
    assert.equal(result.completion.percent, 83.33);
    assert.equal(result.score, 7.93);
  });

  it('counts a job finished after the agreed days as late', () => {
    const orders = [1, 2, 3, 4].map((id) => order({ id: String(id) }));
    orders.push(order({
      id: '5',
      estimatedDays: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-03T00:00:00.000Z',
    }));
    const result = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5)],
    });
    assert.equal(result.onTime.onTime, 4);
    assert.equal(result.onTime.late, 1);
    assert.equal(result.onTime.percent, 80);
    assert.equal(result.score, 8.05);
  });

  it('drops test and fraud orders from every ratio', () => {
    const real = [1, 2, 3, 4, 5].map((id) => order({ id: String(id) }));
    const ignored = [
      order({ id: 't', customerEmail: 'e2e.customer@buildmate.test', orderCode: 'BM-T' }),
      order({ id: 'e', customerEmail: 'runtime@example.com' }),
      order({ id: 'f', cancelReason: 'FRAUD', status: 'CANCELLED', cancelledBy: 'crew', completedAt: null }),
    ];
    const result = scoreReputation({
      orders: [...real, ...ignored],
      reviews: [review('1', 5), review('2', 5), review('3', 5), review('t', 1), review('f', 1)],
    });
    assert.equal(result.validOrders, 5);
    assert.equal(result.reviews.count, 3);
    assert.equal(result.completion.contractorCancelled, 0);
    assert.equal(result.score, 8.35);
  });

  it('uses a neutral complaint score when nothing has been decided', () => {
    const orders = [1, 2, 3, 4, 5].map((id) => order({ id: String(id) }));
    const openOnly = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5)],
      complaints: [{ orderId: '1', status: 'OPEN', updatedAt: '2026-01-04T00:00:00.000Z' }],
    });
    const decided = scoreReputation({
      orders,
      reviews: [review('1', 5), review('2', 5), review('3', 5)],
      complaints: [{ orderId: '1', status: 'RESOLVED', updatedAt: '2026-01-04T00:00:00.000Z' }],
    });
    assert.equal(openOnly.complaints.percent, null);
    assert.equal(openOnly.complaints.open, 1);
    assert.equal(openOnly.score, 8.35);
    assert.equal(decided.complaints.upheld, 1);
    assert.equal(decided.complaints.percent, 0);
    assert.equal(decided.score, 7.85);
  });
});
