const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('../utils/ApiError');
const {
  MATERIAL_ORDER_STATUS,
  MATERIAL_ACTOR,
  STORE_CANCELLABLE_STATUSES,
  assertMaterialStatusTransition,
  storeCancelNotice,
} = require('../utils/material-order.rules');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

function throwsStatus(fn, status) {
  assert.throws(fn, (err) => err instanceof ApiError && err.statusCode === status);
}

describe('Store cancel material order rules', () => {
  it('only allows the store to cancel before the goods leave the store', () => {
    assert.deepEqual([...STORE_CANCELLABLE_STATUSES], [
      'PENDING_PAYMENT',
      'PENDING_CONFIRMATION',
      'DEPOSIT_PAID',
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_DELIVERY',
    ]);

    for (const status of STORE_CANCELLABLE_STATUSES) {
      assert.doesNotThrow(() =>
        assertMaterialStatusTransition(status, MATERIAL_ORDER_STATUS.CANCELLED, MATERIAL_ACTOR.STORE)
      );
    }
  });

  it('blocks the store from cancelling delivered, received or completed orders', () => {
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERING', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERED', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('CUSTOMER_RECEIVED', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('COMPLETED', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('CANCELLED', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
  });

  it('notifies the customer when the store cancels', () => {
    const notice = storeCancelNotice('VL-20260101-ABC');
    assert.equal(notice.audience, 'customer');
    assert.match(notice.message, /VL-20260101-ABC/);
    // Khách tự hủy đơn dùng chung status CANCELLED nhưng không gửi thông báo này.
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'services/material-order.service.js')), false);
  });
});

describe('Store cancel backend wiring', () => {
  it('unmounts store material-order status routes', () => {
    const routes = readBe('routes/materialStoreRoutes.js');
    assert.doesNotMatch(routes, /'\/orders\/:id'/);
    assert.doesNotMatch(routes, /orders\/:id\/cancel/);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'lib/material-order-api.ts')), false);
  });

  it('removes store cancel from the purchase-order service', () => {
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'services/material-order.service.js')), false);
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'controllers/material-order.controller.js')), false);
  });

  it('updates CANCELLED with an atomic conditional update', () => {
    const repo = readBe('repositories/materialOrder.postgres.js');
    assert.match(repo, /async function cancelOrderAtomic/);
    assert.match(repo, /updateMany\(\{[\s\S]*status: \{ in: \[\.\.\.allowedStatuses\] \}/);
    assert.match(repo, /if \(updated\.count !== 1\) return \{ ok: false, reason: 'CONFLICT' \}/);
    assert.match(repo, /reason: 'ALREADY_CANCELLED'/);
    // Chỉ ghi history khi request thắng cập nhật.
    assert.match(repo, /material_order_status_history\.create/);
  });
});

describe('Store cancel frontend and locales', () => {
  it('removes store material-order cancel UI', () => {
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'lib/material-order-api.ts')), false);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'pages/store/StoreOrdersPage.tsx')), false);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'pages/store/StoreOrderDetailPage.tsx')), false);
  });

  it('ships the Vietnamese and English locale keys', () => {
    for (const locale of ['vi', 'en']) {
      const catalog = JSON.parse(readFe(`locales/${locale}/orders.json`));
      const block = catalog.materialOrder;
      for (const key of [
        'storeCancel',
        'storeCancelTitle',
        'storeCancelBody',
        'storeCancelOrder',
        'storeCancelReason',
        'storeCancelConfirm',
        'storeCancelBack',
        'storeCancelDone',
      ]) {
        assert.equal(typeof block[key], 'string', `${locale}.${key}`);
        assert.ok(block[key].length > 0, `${locale}.${key}`);
      }
    }
  });
});

describe('Store cancel HTTP auth when API is up', () => {
  it('rejects unauthenticated store cancels', async (t) => {
    const origin = process.env.BUILDMATE_API_ORIGIN || 'http://127.0.0.1:5000';
    try {
      const health = await fetch(`${origin}/api/health`);
      if (!health.ok) {
        t.skip('API is not reachable');
        return;
      }
    } catch {
      t.skip('API is not reachable');
      return;
    }

    const id = '000000000000000000000000';
    const cancel = await fetch(`${origin}/api/material-store/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED', note: 'Het hang' }),
    });
    assert.equal(cancel.status, 404);
  });

  it('skips live cancel journey when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) return;
    t.skip('isolated test database is not ready');
  });
});
