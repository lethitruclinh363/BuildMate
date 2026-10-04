const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../utils/ApiError');
const { createMaterialDepositService } = require('../services/material-deposit.service');
const { depositCheckoutSchema } = require('../validators/material-order.validator');
const { materialCommissionSnapshot } = require('../utils/material-order.rules');

function memory() {
  const orders = new Map();
  const payments = new Map();
  const commissions = new Map();
  const notifications = [];
  let seq = 1;

  const deps = {
    isProd: () => false,
    findOrderById: async (id) => orders.get(String(id)) || null,
    compareAndSetOrder: async (id, from, update) => {
      const row = orders.get(String(id));
      if (!row || row.status !== from) return null;
      Object.assign(row, update.$set || {});
      if (update.$push && update.$push.statusHistory) row.statusHistory.push(update.$push.statusHistory);
      return row;
    },
    findDepositPayment: async (orderId) => payments.get(String(orderId)) || null,
    insertDepositPayment: async (doc) => {
      const key = String(doc.materialOrderId);
      if (payments.has(key)) return { payment: payments.get(key), created: false };
      const payment = { ...doc, _id: `pay-${seq}`, metadata: doc.metadata || {} };
      seq += 1;
      payments.set(key, payment);
      return { payment, created: true };
    },
    compareAndSetPayment: async (id, from, update) => {
      const payment = [...payments.values()].find((row) => String(row._id) === String(id));
      if (!payment || payment.status !== from) return null;
      Object.assign(payment, update.$set || {});
      return payment;
    },
    findCommission: async (paymentId) => commissions.get(String(paymentId)) || null,
    insertCommission: async (doc) => {
      const key = String(doc.materialOrderPaymentId);
      if (commissions.has(key)) {
        const err = new Error('duplicate');
        err.code = 11000;
        throw err;
      }
      const commission = { ...doc, _id: `com-${seq}` };
      seq += 1;
      commissions.set(key, commission);
      return { commission, created: true };
    },
    notifyStore: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  };

  return {
    deps,
    notifications,
    payments,
    commissions,
    seed(order) {
      orders.set(String(order._id), { statusHistory: [], paymentStatus: 'UNPAID', ...order });
    },
  };
}

function sampleOrder(overrides = {}) {
  return {
    _id: 'order-1',
    orderCode: 'VL-20261002-ABC123',
    customerId: 'customer-1',
    storeId: 'store-1',
    storeOwnerId: 'owner-1',
    status: 'PENDING_PAYMENT',
    depositAmount: 330000,
    platformFeeAmount: 100000,
    platformFeeRateSnapshot: 5,
    storeDepositAmount: 230000,
    remainingAmount: 1870000,
    materialSubtotal: 2000000,
    shippingFee: 200000,
    totalAmount: 2200000,
    ...overrides,
  };
}

describe('material deposit payment', () => {
  it('checks out one pending deposit and keeps the order waiting for the store', async () => {
    const db = memory();
    db.seed(sampleOrder());
    const api = createMaterialDepositService(db.deps);
    const started = await api.checkout({ id: 'customer-1' }, 'order-1');
    assert.equal(started.duplicated, false);
    assert.equal(started.payment.status, 'PENDING');
    assert.equal(started.payment.amount, 330000);
    assert.equal(started.order.status, 'PENDING_PAYMENT');
    assert.equal(started.order.paymentStatus, 'PENDING');
    assert.equal(db.payments.size, 1);
  });

  it('refreshes checkout without a second payment', async () => {
    const db = memory();
    db.seed(sampleOrder());
    const api = createMaterialDepositService(db.deps);
    await api.checkout({ id: 'customer-1' }, 'order-1');
    const again = await api.checkout({ id: 'customer-1' }, 'order-1');
    assert.equal(again.duplicated, true);
    assert.equal(again.payment.status, 'PENDING');
    assert.equal(db.payments.size, 1);
    assert.equal(db.commissions.size, 0);
  });

  it('captures the deposit once and posts the order snapshot as commission', async () => {
    const db = memory();
    db.seed(sampleOrder());
    const api = createMaterialDepositService(db.deps);
    await api.checkout({ id: 'customer-1' }, 'order-1');
    const paid = await api.capture({ id: 'customer-1' }, 'order-1');
    assert.equal(paid.duplicated, false);
    assert.equal(paid.payment.status, 'PAID');
    assert.equal(paid.order.status, 'DEPOSIT_PAID');
    assert.notEqual(paid.order.status, 'PREPARING');
    assert.equal(paid.order.paymentStatus, 'PAID');
    assert.equal(paid.commission.platformAmount, 100000);
    assert.equal(paid.commission.storeAmount, 230000);
    assert.equal(paid.commission.rateSnapshot, 5);
    assert.notEqual(paid.commission.platformAmount, Math.round(330000 * 0.05));
    assert.equal(db.notifications.length, 1);
    assert.equal(db.notifications[0].userId, 'owner-1');
    assert.equal(db.notifications[0].link, '/store/orders');
  });

  it('ignores a duplicate callback and a second refresh', async () => {
    const db = memory();
    db.seed(sampleOrder());
    const api = createMaterialDepositService(db.deps);
    await api.checkout({ id: 'customer-1' }, 'order-1');
    const results = await Promise.all([
      api.capture({ id: 'customer-1' }, 'order-1'),
      api.capture({ id: 'customer-1' }, 'order-1'),
    ]);
    const third = await api.capture({ id: 'customer-1' }, 'order-1');
    const stored = await db.deps.findOrderById('order-1');
    assert.equal(stored.status, 'DEPOSIT_PAID');
    assert.equal(results.filter((row) => row.duplicated).length, 1);
    assert.equal(third.duplicated, true);
    assert.equal(db.payments.size, 1);
    assert.equal(db.commissions.size, 1);
    assert.equal(db.notifications.length, 1);
    assert.equal([...db.payments.values()][0].status, 'PAID');
  });

  it('rejects another customer', async () => {
    const db = memory();
    db.seed(sampleOrder());
    const api = createMaterialDepositService(db.deps);
    await assert.rejects(api.checkout({ id: 'customer-2' }, 'order-1'), (err) => {
      return err instanceof ApiError && err.statusCode === 403;
    });
  });

  it('rejects a cancelled order before checkout and after a pending payment', async () => {
    const db = memory();
    db.seed(sampleOrder({ status: 'CANCELLED' }));
    const api = createMaterialDepositService(db.deps);
    await assert.rejects(api.checkout({ id: 'customer-1' }, 'order-1'), (err) => {
      return err instanceof ApiError && err.statusCode === 409;
    });

    const live = memory();
    live.seed(sampleOrder());
    const liveApi = createMaterialDepositService(live.deps);
    await liveApi.checkout({ id: 'customer-1' }, 'order-1');
    const order = await live.deps.findOrderById('order-1');
    order.status = 'CANCELLED';
    await assert.rejects(liveApi.capture({ id: 'customer-1' }, 'order-1'), (err) => {
      return err instanceof ApiError && err.statusCode === 409;
    });
    assert.equal(live.commissions.size, 0);
    assert.equal(live.notifications.length, 0);
    assert.equal([...live.payments.values()][0].status, 'PENDING');
  });

  it('rejects a client amount on the checkout payload', () => {
    const parsed = depositCheckoutSchema.safeParse({ method: 'MOCK', amount: 1, depositAmount: 330000 });
    assert.equal(parsed.success, false);
    const snapshot = materialCommissionSnapshot(sampleOrder());
    assert.equal(snapshot.platformAmount, 100000);
    assert.equal(snapshot.storeAmount, 230000);
  });
});
