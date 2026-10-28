const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('../utils/ApiError');
const {
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  TRANSITIONS,
  nextStoreFulfillment,
  assertMaterialStatusTransition,
  materialStatusNotice,
  summarizeMaterialEarnings,
  PLATFORM_FEE_RATE,
  DEPOSIT_RATE,
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

describe('Flow 10 material order statuses', () => {
  it('keeps the eleven statuses and splits COD from legacy deposit', () => {
    assert.deepEqual(Object.keys(MATERIAL_ORDER_STATUS).sort(), [
      'CANCELLED',
      'COMPLETED',
      'CONFIRMED',
      'CUSTOMER_RECEIVED',
      'DELIVERED',
      'DELIVERING',
      'DEPOSIT_PAID',
      'PENDING_CONFIRMATION',
      'PENDING_PAYMENT',
      'PREPARING',
      'READY_FOR_DELIVERY',
    ]);
    assert.equal(MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION, 'PENDING_CONFIRMATION');
    assert.equal(MATERIAL_ORDER_STATUS.PENDING_PAYMENT, 'PENDING_PAYMENT');
    assert.equal(DEPOSIT_RATE, 0);
    assert.equal(PLATFORM_FEE_RATE, 0);
    const create = readBe('services/material-order.service.js');
    assert.match(create, /status: MATERIAL_ORDER_STATUS\.PENDING_CONFIRMATION/);
    assert.match(create, /paymentMethod: 'COD'/);
    assert.doesNotMatch(create, /DELIVERY_FAILED/);
    assert.doesNotMatch(readBe('utils/material-order.rules.js'), /DELIVERY_FAILED/);
  });

  it('walks store self-delivery forward one step and blocks skips or reverse moves', () => {
    assert.equal(nextStoreFulfillment('PENDING_CONFIRMATION'), 'CONFIRMED');
    assert.equal(nextStoreFulfillment('CONFIRMED'), 'PREPARING');
    assert.equal(nextStoreFulfillment('PREPARING'), 'READY_FOR_DELIVERY');
    assert.equal(nextStoreFulfillment('READY_FOR_DELIVERY'), 'DELIVERING');
    assert.equal(nextStoreFulfillment('DELIVERING'), 'DELIVERED');
    assert.equal(nextStoreFulfillment('DELIVERED'), null);
    assert.deepEqual(TRANSITIONS.DELIVERING, ['DELIVERED']);
    assert.deepEqual(TRANSITIONS.DELIVERED, ['CUSTOMER_RECEIVED']);
    assert.deepEqual(TRANSITIONS.CUSTOMER_RECEIVED, ['COMPLETED']);
    assert.deepEqual(TRANSITIONS.COMPLETED, []);
    assert.deepEqual(TRANSITIONS.CANCELLED, []);
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PENDING_CONFIRMATION', 'CONFIRMED', MATERIAL_ACTOR.STORE)
    );
    throwsStatus(
      () => assertMaterialStatusTransition('CONFIRMED', 'DELIVERING', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('PREPARING', 'CONFIRMED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERED', 'CUSTOMER_RECEIVED', MATERIAL_ACTOR.STORE),
      403
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERING', 'DELIVERED', MATERIAL_ACTOR.CUSTOMER),
      403
    );
  });

  it('lets the customer receive only after DELIVERED and auto-completes in one receive call', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('DELIVERED', 'CUSTOMER_RECEIVED', MATERIAL_ACTOR.CUSTOMER)
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('CUSTOMER_RECEIVED', 'COMPLETED', MATERIAL_ACTOR.SYSTEM)
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERING', 'CUSTOMER_RECEIVED', MATERIAL_ACTOR.CUSTOMER),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERED', 'COMPLETED', MATERIAL_ACTOR.CUSTOMER),
      409
    );
    const service = readBe('services/material-order.service.js');
    assert.match(service, /MATERIAL_ORDER_STATUS\.CUSTOMER_RECEIVED/);
    assert.match(service, /MATERIAL_ACTOR\.SYSTEM[\s\S]*MATERIAL_ORDER_STATUS\.COMPLETED/);
    assert.match(service, /withOrderLock/);
    assert.match(service, /if \(order\.status === MATERIAL_ORDER_STATUS\.COMPLETED\) return presentOrder\(order\)/);
  });
});

describe('Flow 10 cancel, COD and notices', () => {
  it('limits customer cancel to unpaid COD and blocks cancel after the store starts work', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PENDING_CONFIRMATION', 'CANCELLED', MATERIAL_ACTOR.CUSTOMER)
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PENDING_CONFIRMATION', 'CANCELLED', MATERIAL_ACTOR.STORE)
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition('PREPARING', 'CANCELLED', MATERIAL_ACTOR.STORE)
    );
    throwsStatus(
      () => assertMaterialStatusTransition('PREPARING', 'CANCELLED', MATERIAL_ACTOR.CUSTOMER),
      403
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERING', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('DELIVERED', 'CANCELLED', MATERIAL_ACTOR.STORE),
      409
    );
    throwsStatus(
      () => assertMaterialStatusTransition('COMPLETED', 'PREPARING', MATERIAL_ACTOR.STORE),
      409
    );
  });

  it('does not treat COD goods or shipping as platform revenue and collects only after delivery', () => {
    const summary = summarizeMaterialEarnings([
      {
        status: 'COMPLETED',
        totalAmount: 2_100_000,
        remainingAmount: 2_100_000,
        paymentStatus: MATERIAL_PAYMENT_STATUS.UNPAID,
      },
      {
        status: 'DELIVERING',
        totalAmount: 500_000,
        remainingAmount: 500_000,
        paymentStatus: MATERIAL_PAYMENT_STATUS.UNPAID,
      },
    ]);
    assert.equal(summary.platformFees, 0);
    assert.equal(summary.onlineDeposits, 0);
    assert.equal(summary.orderValue, 2_100_000);
    assert.equal(summary.collectedAmount, 0);
    const service = readBe('services/material-order.service.js');
    assert.match(service, /Direct payment can be confirmed after delivery/);
    assert.match(service, /remainingSettledOffline && order\.paymentStatus === MATERIAL_PAYMENT_STATUS\.PAID/);
    assert.doesNotMatch(service, /escrowService/);
    assert.equal(materialStatusNotice('CONFIRMED', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('DELIVERING', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('DELIVERED', 'VL-1').audience, 'customer');
    assert.equal(materialStatusNotice('CUSTOMER_RECEIVED', 'VL-1').audience, 'store');
    assert.equal(materialStatusNotice('PREPARING', 'VL-1'), null);
    assert.equal(materialStatusNotice('COMPLETED', 'VL-1'), null);
    assert.equal(materialStatusNotice('CANCELLED', 'VL-1'), null);
  });
});

describe('Flow 10 frontend store and customer surfaces', () => {
  it('lets the store advance one fulfillment step and collect COD after DELIVERED', () => {
    const api = readFe('lib/material-order-api.ts');
    const page = readFe('pages/store/StoreOrderDetailPage.tsx');
    assert.match(api, /PENDING_CONFIRMATION: 'CONFIRMED'/);
    assert.match(api, /DELIVERING: 'DELIVERED'/);
    assert.doesNotMatch(api, /DELIVERED: 'CUSTOMER_RECEIVED'/);
    assert.match(page, /if \(!next \|\| busy\) return/);
    assert.match(page, /materialStoreOrderApi\.updateStatus/);
    assert.match(page, /collectPayment/);
    assert.match(page, /\['DELIVERED', 'CUSTOMER_RECEIVED', 'COMPLETED'\]/);
    assert.match(page, /priceSnapshot/);
    assert.match(page, /SiteLocationCard/);
    assert.doesNotMatch(page, /watchPosition|geolocation/);
  });

  it('lets the customer receive only at DELIVERED and review after receipt', () => {
    const page = readFe('pages/customer/MaterialOrderDetailPage.tsx');
    const live = readFe('features/material-orders/material-order-live.ts');
    assert.match(page, /if \(busy\) return/);
    assert.match(page, /order\.status === 'DELIVERED'/);
    assert.match(page, /materialOrderApi\.receive/);
    assert.match(page, /status === 'PENDING_PAYMENT' \|\| order\.status === 'PENDING_CONFIRMATION'/);
    assert.match(page, /order\.status === 'COMPLETED' \|\| order\.status === 'CUSTOMER_RECEIVED'/);
    assert.match(page, /reviewApi\.createMaterial/);
    assert.match(live, /material_order_updated/);
    const review = readBe('services/reviewService.js');
    assert.match(review, /Reviews are allowed only after the material order is received/);
  });
});

describe('Flow 10 HTTP auth when API is up', () => {
  it('rejects unauthenticated store advances, receive and COD collection', async (t) => {
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
    const patch = await fetch(`${origin}/api/material-store/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    const receive = await fetch(`${origin}/api/material-orders/${id}/receive`, { method: 'POST' });
    const collect = await fetch(`${origin}/api/material-store/orders/${id}/collected`, { method: 'POST' });
    assert.equal(patch.status, 401);
    assert.equal(receive.status, 401);
    assert.equal(collect.status, 401);
  });
});

describe('Flow 10 isolated Postgres journeys', () => {
  it('skips live fulfillment HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Covered by material-order HTTP when isolated Postgres is up');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
