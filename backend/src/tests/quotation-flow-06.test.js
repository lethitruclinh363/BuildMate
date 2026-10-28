const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { QUOTATION_STATUS, QUOTE_ITEM_TYPE } = require('../models/Quotation');
const { PAYMENT_STATUS, PAYMENT_TYPE } = require('../models/Payment');
const { ORDER_STATUS } = require('../models/Order');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const {
  snapshotContractorQuote,
  canStartWork,
  canReleaseEscrow,
  defaultEscrowRecord,
  applyDepositCaptured,
  cancelWithoutFunding,
  holdCustomerCancel,
  refundEscrow,
  ESCROW_STATUS,
  DEPOSIT_RATE,
  PLATFORM_FEE_RATE,
} = require('../utils/contractor-finance');
const {
  tally,
  lineQty,
  quoteReplayFingerprint,
  isQuoteReplay,
  REPLAY_WINDOW_MS,
} = require('../services/quotationService');
const { createQuotationSchema } = require('../validators/sprint4.validator');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Flow 06 quotation statuses and create gate', () => {
  it('keeps the five quotation statuses already in the model', () => {
    assert.deepEqual(Object.keys(QUOTATION_STATUS).sort(), [
      'ACCEPTED',
      'DRAFT',
      'MODIFICATION_REQUEST',
      'REJECTED',
      'SENT',
    ]);
  });

  it('creates quotations as SENT and does not use DRAFT in the send path', () => {
    const src = readBe('services/quotationService.js');
    assert.match(src, /status: QUOTATION_STATUS\.SENT/);
    assert.match(src, /request\.status !== REQUEST_STATUS\.ACCEPTED/);
    assert.match(src, /You cannot quote this request/);
    assert.match(src, /A quotation was already accepted/);
  });

  it('rejects invalid create payloads before they reach persistence', () => {
    assert.throws(() => createQuotationSchema.parse({ requestId: 'short', items: [] }));
    const parsed = createQuotationSchema.parse({
      requestId: '507f1f77bcf86cd799439011',
      items: [{ type: QUOTE_ITEM_TYPE.LABOR, name: 'Pipe repair', quantity: 1, price: 200000 }],
      transportCost: 0,
    });
    assert.equal(parsed.items.length, 1);
  });
});

describe('Flow 06 quote tally and replay', () => {
  it('recomputes totals on the backend and treats quantity 0 as zero, not one', () => {
    const zero = tally([{ type: 'MATERIAL', name: 'Sealant', quantity: 0, price: 40000 }], 0);
    assert.equal(lineQty({ quantity: 0 }), 0);
    assert.equal(lineQty({}), 1);
    assert.equal(zero.materialCost, 0);
    assert.equal(zero.totalCost, 0);
    const priced = tally(
      [
        { type: 'MATERIAL', name: 'Sealant', quantity: 2, price: 40000 },
        { type: 'LABOR', name: 'Repair', quantity: 1, price: 200000 },
      ],
      50000
    );
    assert.equal(priced.materialCost, 80000);
    assert.equal(priced.laborCost, 200000);
    assert.equal(priced.transportCost, 50000);
    assert.equal(priced.totalCost, 330000);
  });

  it('fingerprints the same send and allows a later distinct quote', () => {
    const payload = {
      requestId: 'req-1',
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: 500000 }],
      transportCost: 0,
      estimatedDays: 2,
      note: 'First visit',
    };
    const same = quoteReplayFingerprint('c1', payload);
    const again = quoteReplayFingerprint('c1', { ...payload });
    const cheaper = quoteReplayFingerprint('c1', {
      ...payload,
      items: [{ type: 'LABOR', name: 'Pipe repair', quantity: 1, price: 400000 }],
    });
    assert.equal(same, again);
    assert.notEqual(same, cheaper);
    const recent = {
      items: payload.items,
      transportCost: 0,
      note: 'First visit',
      createdAt: new Date(),
      status: 'SENT',
    };
    assert.equal(isQuoteReplay(recent, payload), true);
    const stale = { ...recent, createdAt: new Date(Date.now() - REPLAY_WINDOW_MS - 1000) };
    assert.equal(isQuoteReplay(stale, payload), false);
  });

  it('hides quote actions until the request is ACCEPTED and blocks a zero total on the form', () => {
    const page = readFe('pages/contractor/CreateQuotationPage.tsx');
    assert.match(page, /canCreateQuotation\(next\.status\)/);
    assert.match(page, /loading=\{saving\}/);
    assert.match(page, /totals\.total <= 0/);
    const types = readFe('types/sprint4.ts');
    assert.match(types, /status === 'ACCEPTED'/);
  });
});

describe('Flow 06 deposit 15/5/10/85', () => {
  it('splits 10_000_000 using the locked contractor rates', () => {
    assert.equal(DEPOSIT_RATE, 0.15);
    assert.equal(PLATFORM_FEE_RATE, 0.05);
    const snap = snapshotContractorQuote(10_000_000);
    assert.equal(snap.ok, true);
    assert.equal(snap.depositAmount, 1_500_000);
    assert.equal(snap.platformFee, 500_000);
    assert.equal(snap.contractorHold, 1_000_000);
    assert.equal(snap.remainingAmount, 8_500_000);
    assert.equal(snap.depositAmount + snap.remainingAmount, snap.totalAmount);
    assert.equal(snap.platformFee + snap.contractorHold, snap.depositAmount);
  });

  it('starts work only after DEPOSIT_PAID and HELD escrow', () => {
    assert.equal(canStartWork(ORDER_STATUS.QUOTATION_ACCEPTED, ESCROW_STATUS.NOT_FUNDED), false);
    assert.equal(canStartWork(ORDER_STATUS.DEPOSIT_PAID, ESCROW_STATUS.HELD), true);
    const progress = readBe('services/progressService.js');
    assert.match(progress, /Deposit must be paid before work can start/);
    assert.match(progress, /Deposit must be held in escrow before work can start/);
  });

  it('creates a deposit payment from the backend snapshot, not a frontend total', () => {
    const src = readBe('services/orderService.js');
    assert.match(src, /snapshotContractorQuote\(quotation\.totalCost\)/);
    assert.match(src, /amount: finance\.depositAmount/);
    assert.match(src, /type: PAYMENT_TYPE\.DEPOSIT/);
    assert.match(src, /quotationId: quotation\._id/);
    assert.match(src, /duplicated: true/);
  });
});

describe('Flow 06 mock payment, escrow and cancel policy', () => {
  it('protects mock-success as a customer-only non-production capture', () => {
    const routes = readBe('routes/paymentRoutes.js');
    const service = readBe('services/paymentService.js');
    assert.match(routes, /mock-success/);
    assert.doesNotMatch(routes, /mock-fail|mockFail/);
    assert.match(routes, /authorize\(ROLES\.CUSTOMER\)/);
    assert.match(service, /env\.isProd/);
    assert.match(service, /customerOnly: true/);
    assert.match(service, /withCaptureLock/);
    assert.match(service, /duplicated: true/);
  });

  it('keeps escrow payout behind customer acceptance, remaining 85%, and no open complaint', () => {
    const held = applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow;
    assert.equal(canReleaseEscrow({
      escrow: held,
      customerAccepted: true,
      remainingSettled: false,
      openComplaint: false,
    }).ok, false);
    assert.equal(canReleaseEscrow({
      escrow: held,
      customerAccepted: false,
      remainingSettled: true,
      openComplaint: false,
    }).ok, false);
    assert.equal(canReleaseEscrow({
      escrow: held,
      customerAccepted: true,
      remainingSettled: true,
      openComplaint: true,
    }).ok, false);
    assert.equal(canReleaseEscrow({
      escrow: held,
      customerAccepted: true,
      remainingSettled: true,
      openComplaint: false,
    }).ok, true);
  });

  it('closes unpaid escrow, freezes customer-after-deposit, and refunds contractor cancel once', () => {
    const unpaid = cancelWithoutFunding(defaultEscrowRecord(snapshotContractorQuote(10_000_000)));
    assert.equal(unpaid.escrow.status, ESCROW_STATUS.CANCELLED_SETTLED);
    const funded = applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow;
    const frozen = holdCustomerCancel(funded, 'Customer cancelled');
    assert.equal(frozen.escrow.status, ESCROW_STATUS.FROZEN);
    const refunded = refundEscrow(applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow, {
      fullDeposit: true,
    });
    assert.equal(refunded.escrow.refundedAmount, 1_500_000);
    assert.equal(refundEscrow(refunded.escrow, { fullDeposit: true }).ok, false);
    const cancel = readBe('services/orderService.js');
    assert.match(cancel, /refundDeposit/);
    assert.match(cancel, /holdAfterCustomerCancel/);
    const settle = readBe('services/escrowService.js');
    assert.match(settle, /requireAdmin/);
    assert.match(settle, /ALREADY_RELEASED|canReleaseEscrow/);
  });

  it('restricts settle to admin and remaining confirmation to the order parties', () => {
    const orders = readBe('routes/orderRoutes.js');
    const admin = readBe('routes/adminRoutes.js');
    assert.match(orders, /allowRole\('ADMIN'\).*settleEscrow|settle-escrow[\s\S]*allowRole\('ADMIN'\)/);
    assert.match(admin, /escrow\/settle/);
    assert.match(orders, /remaining-received/);
    assert.equal(PAYMENT_STATUS.UNPAID, 'UNPAID');
    assert.equal(PAYMENT_TYPE.DEPOSIT, 'DEPOSIT');
    assert.equal(REQUEST_STATUS.ACCEPTED, 'ACCEPTED');
  });
});

describe('Flow 06 frontend money display', () => {
  it('shows the 15/5/10/85 split from the shared helper, not a posted total from the contractor', () => {
    const helper = readFe('lib/contractor-finance.ts');
    const page = readFe('pages/customer/CustomerQuotationPage.tsx');
    const pay = readFe('features/payments/pages/PaymentPage.tsx');
    assert.match(helper, /total \* 0\.15/);
    assert.match(helper, /total \* 0\.05/);
    assert.match(page, /contractorQuoteSplit\(quote\.totalCost\)/);
    assert.match(page, /quotationApi\.accept/);
    assert.match(pay, /paymentApi\.checkout/);
    assert.match(pay, /mockSuccess/);
    assert.match(pay, /import\.meta\.env\.DEV \|\| import\.meta\.env\.MODE !== 'production'/);
  });
});

describe('Flow 06 HTTP auth when API is up', () => {
  it('rejects unauthenticated quotation and payment calls', async (t) => {
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
    const quote = await fetch(`${origin}/api/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: '000000000000000000000000',
        items: [{ type: 'LABOR', name: 'Work', quantity: 1, price: 1 }],
      }),
    });
    const pay = await fetch(`${origin}/api/payments/000000000000000000000000/mock-success`, { method: 'POST' });
    const settle = await fetch(`${origin}/api/orders/000000000000000000000000/settle-escrow`, { method: 'POST' });
    assert.equal(quote.status, 401);
    assert.equal(pay.status, 401);
    assert.equal(settle.status, 401);
  });
});

describe('Flow 06 isolated Postgres journeys', () => {
  it('skips paid-deposit HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Covered by sprint63-validation and e2e-workflow when isolated Postgres is up');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
