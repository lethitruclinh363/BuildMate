const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ORDER_STATUS,
  PROGRESS_STATUS,
  CANCELLABLE_ORDER_STATUSES,
  isValidProgressTransition,
  orderStatusAfterProgress,
  orderStatusAfterDeposit,
} = require('../utils/order.rules');
const { canStartWork, ESCROW_STATUS } = require('../utils/contractor-finance');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Flow 07 repair job statuses', () => {
  it('keeps the live order statuses including unused request/quote-sent values', () => {
    assert.deepEqual(Object.keys(ORDER_STATUS).sort(), [
      'CANCELLED',
      'COMPLETED',
      'CUSTOMER_ACCEPTED',
      'DEPOSIT_PAID',
      'IN_PROGRESS',
      'QUOTATION_ACCEPTED',
      'QUOTATION_SENT',
      'REQUEST_CREATED',
      'STARTED',
    ]);
    assert.deepEqual(Object.keys(PROGRESS_STATUS).sort(), ['COMPLETED', 'IN_PROGRESS', 'STARTED']);
    assert.deepEqual(CANCELLABLE_ORDER_STATUSES, [
      ORDER_STATUS.QUOTATION_ACCEPTED,
      ORDER_STATUS.DEPOSIT_PAID,
    ]);
  });

  it('creates a job only from an accepted quotation and starts it at QUOTATION_ACCEPTED', () => {
    const src = readBe('services/orderService.js');
    assert.match(src, /createFromQuotation/);
    assert.match(src, /status: ORDER_STATUS\.QUOTATION_ACCEPTED/);
    assert.match(src, /quotationId: quotation\._id/);
    assert.match(src, /duplicated: true/);
    assert.equal(
      orderStatusAfterDeposit(ORDER_STATUS.QUOTATION_ACCEPTED),
      ORDER_STATUS.DEPOSIT_PAID
    );
    assert.equal(orderStatusAfterDeposit(ORDER_STATUS.STARTED), ORDER_STATUS.STARTED);
  });
});

describe('Flow 07 progress guards', () => {
  it('blocks start before deposit and skipping STARTED → COMPLETED', () => {
    assert.equal(isValidProgressTransition(ORDER_STATUS.QUOTATION_ACCEPTED, PROGRESS_STATUS.STARTED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.DEPOSIT_PAID, PROGRESS_STATUS.STARTED), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.STARTED, PROGRESS_STATUS.COMPLETED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.STARTED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.COMPLETED), true);
    assert.equal(isValidProgressTransition(ORDER_STATUS.COMPLETED, PROGRESS_STATUS.COMPLETED), false);
    assert.equal(isValidProgressTransition(ORDER_STATUS.CANCELLED, PROGRESS_STATUS.STARTED), false);
    assert.equal(canStartWork(ORDER_STATUS.QUOTATION_ACCEPTED, ESCROW_STATUS.NOT_FUNDED), false);
    assert.equal(canStartWork(ORDER_STATUS.DEPOSIT_PAID, ESCROW_STATUS.HELD), true);
  });

  it('maps contractor reports to COMPLETED and keeps CUSTOMER_ACCEPTED as customer handover', () => {
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.IN_PROGRESS, PROGRESS_STATUS.COMPLETED),
      ORDER_STATUS.COMPLETED
    );
    assert.equal(
      orderStatusAfterProgress(ORDER_STATUS.CUSTOMER_ACCEPTED, PROGRESS_STATUS.COMPLETED),
      ORDER_STATUS.CUSTOMER_ACCEPTED
    );
    const progress = readBe('services/progressService.js');
    const orders = readBe('services/orderService.js');
    assert.match(progress, /Invalid progress transition/);
    assert.match(progress, /Deposit must be paid before work can start/);
    assert.match(progress, /withProgressLock/);
    assert.match(progress, /You cannot update progress on this order/);
    assert.match(progress, /Order is closed/);
    assert.match(orders, /Only the customer can complete this order/);
    assert.match(orders, /Order is not waiting for customer acceptance/);
    assert.match(orders, /duplicated: true/);
    assert.match(orders, /CUSTOMER_ACCEPTED/);
  });

  it('does not treat 85% remaining as platform revenue and settle still needs both flags', () => {
    const escrow = readBe('services/escrowService.js');
    assert.match(escrow, /remainingSettled/);
    assert.match(escrow, /Direct 85% remaining confirmed \(off platform\)/);
    assert.match(escrow, /duplicated: true/);
    assert.match(escrow, /customerAccepted: order\.status === 'CUSTOMER_ACCEPTED'/);
    assert.match(escrow, /requireAdmin/);
  });
});

describe('Flow 07 frontend job surfaces', () => {
  it('lets the contractor start only after DEPOSIT_PAID and hides progress after COMPLETED', () => {
    const contractor = readFe('pages/contractor/ContractorOrderDetailPage.tsx');
    const customer = readFe('pages/customer/CustomerOrderDetailPage.tsx');
    const form = readFe('features/progress/components/ProgressUpdateForm.tsx');
    assert.match(contractor, /READY_TO_START: OrderStatus\[] = \['DEPOSIT_PAID'\]/);
    assert.match(contractor, /waitDeposit/);
    assert.match(contractor, /ProgressUpdateForm/);
    assert.match(customer, /order\.status === 'COMPLETED'/);
    assert.match(customer, /orderApi\.complete/);
    assert.match(customer, /confirmRemaining/);
    assert.match(form, /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/);
    assert.doesNotMatch(form, /video/);
    const status = readFe('features/orders/types/orderStatus.ts');
    assert.match(status, /case 'DEPOSIT_PAID':\s*return \['STARTED'\]/);
    assert.match(status, /case 'STARTED':\s*return \['STARTED', 'IN_PROGRESS'\]/);
    assert.match(status, /case 'IN_PROGRESS':\s*return \['IN_PROGRESS', 'COMPLETED'\]/);
    assert.match(status, /canCancelOrder[\s\S]*QUOTATION_ACCEPTED[\s\S]*DEPOSIT_PAID/);
  });
});

describe('Flow 07 HTTP auth when API is up', () => {
  it('rejects unauthenticated progress, complete and remaining confirmation', async (t) => {
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
    const progress = await fetch(`${origin}/api/orders/000000000000000000000000/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'STARTED', description: 'Unauth start' }),
    });
    const complete = await fetch(`${origin}/api/orders/000000000000000000000000/complete`, { method: 'POST' });
    const remaining = await fetch(`${origin}/api/orders/000000000000000000000000/remaining-received`, {
      method: 'POST',
    });
    assert.equal(progress.status, 401);
    assert.equal(complete.status, 401);
    assert.equal(remaining.status, 401);
  });
});

describe('Flow 07 isolated Postgres journeys', () => {
  it('skips paid job HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Covered by order-flow, edge-orders and e2e-workflow when isolated Postgres is up');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
