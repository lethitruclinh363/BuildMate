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
    const service = readBe('services/material-order.service.js');
    assert.match(service, /storeCancelNotice\(fresh\.orderCode\)/);
    assert.match(service, /userId: fresh\.customerId/);
  });
});

describe('Store cancel backend wiring', () => {
  it('reuses the existing store status route without a duplicate cancel endpoint', () => {
    const routes = readBe('routes/materialStoreRoutes.js');
    const api = readFe('lib/material-order-api.ts');
    assert.match(routes, /'\/orders\/:id'/);
    assert.doesNotMatch(routes, /orders\/:id\/cancel/);
    assert.match(api, /status: 'CANCELLED'/);
  });

  it('guards ownership, status, payment and duplicate cancels in the service', () => {
    const service = readBe('services/material-order.service.js');
    assert.match(service, /async function cancelForStore\(store, user, id, note = ''\)/);
    // Chỉ đơn thuộc cửa hàng đang đăng nhập.
    assert.match(service, /storeId: store\._id/);
    assert.match(service, /assertMaterialStatusTransition\([\s\S]*MATERIAL_ACTOR\.STORE/);
    assert.match(service, /MATERIAL_PAYMENT_STATUS\.PAID/);
    assert.match(service, /PAYMENT_COLLECTED/);
    // Hủy trùng trả về đơn hiện tại thay vì tạo sự kiện thứ hai.
    assert.match(service, /if \(order\.status === MATERIAL_ORDER_STATUS\.CANCELLED\) \{\s*return presentOrder\(order\)/);
    assert.match(service, /cancelOrderAtomic/);
    assert.match(service, /STATUS_CONFLICT/);
    assert.match(service, /ORDER_CANCELLED/);
    assert.match(service, /if \(body\.status === MATERIAL_ORDER_STATUS\.CANCELLED\)/);
    // Không tạo escrow/commission trong luồng hủy vật liệu COD.
    assert.doesNotMatch(service, /escrowService|createCommission/);
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
  it('exposes the cancel helper and endpoint to the store UI', () => {
    const api = readFe('lib/material-order-api.ts');
    assert.match(api, /export function canStoreCancel/);
    assert.match(api, /'PENDING_CONFIRMATION'/);
    assert.match(api, /if \(paymentStatus === 'PAID'\) return false/);
    assert.match(api, /cancel: \(id: string, reason\?: string\)/);
  });

  it('renders a confirm modal with a reason field on both store surfaces', () => {
    for (const page of ['pages/store/StoreOrdersPage.tsx', 'pages/store/StoreOrderDetailPage.tsx']) {
      const source = readFe(page);
      assert.match(source, /canStoreCancel/);
      assert.match(source, /ConfirmModal/);
      assert.match(source, /materialOrder\.storeCancelTitle/);
      assert.match(source, /materialOrder\.storeCancelReason/);
      assert.match(source, /if \(busy\) return|!cancelTarget \|\| busy/);
    }
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
    assert.equal(cancel.status, 401);
  });

  it('skips live cancel journey when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) return;
    t.skip('isolated test database is not ready');
  });
});
