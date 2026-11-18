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

  it('uses the submitted transportation cost when calculating and storing a quotation', () => {
    const src = readBe('services/quotationService.js');
    assert.match(src, /const costs = tally\(items, payload\.transportCost \|\| 0\)/);
    assert.match(src, /items,\s*\.\.\.costs,/);
    assert.doesNotMatch(src, /transportCost:\s*0,\s*estimatedDays:/);
  });

  it('rejects invalid create payloads before they reach persistence', () => {
    assert.throws(() => createQuotationSchema.parse({ requestId: 'short', items: [] }));
    assert.throws(() => createQuotationSchema.parse({
      requestId: '507f1f77bcf86cd799439011',
      items: [{ type: QUOTE_ITEM_TYPE.MATERIAL, name: 'Xi mang', quantity: 1, price: 100000 }],
    }));
    const parsed = createQuotationSchema.parse({
      requestId: '507f1f77bcf86cd799439011',
      items: [{ type: QUOTE_ITEM_TYPE.LABOR, name: 'Pipe repair', quantity: 1, price: 200000 }],
      transportCost: 0,
    });
    assert.equal(parsed.items.length, 1);
  });

  it('accepts a revision payload whose line items still have catalogId null from toPublic()', () => {
    const parsed = createQuotationSchema.parse({
      requestId: '941a18d94f141f6558b1539',
      items: [
        { type: QUOTE_ITEM_TYPE.LABOR, name: 'Nhan cong', quantity: 1, unit: 'job', price: 200000, catalogId: null },
      ],
      transportCost: 0,
      estimatedDays: 3,
      note: 'abcdddd',
    });
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].catalogId ?? null, null);
    assert.equal(parsed.transportCost, 0);
    assert.equal(parsed.estimatedDays, 3);
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

  it('strips null catalogId when resending a revised quotation', () => {
    const page = readFe('pages/contractor/CreateQuotationPage.tsx');
    assert.match(page, /function toQuotePayloadItems/);
    assert.match(page, /items: toQuotePayloadItems\(items\)/);
    assert.match(page, /toQuotePayloadItems\(last\.items/);
    assert.doesNotMatch(page, /catalogId: item\.catalogId \|\| null/);
    assert.doesNotMatch(page, /type: 'MATERIAL'/);
  });

  it('lets the contractor enter a priceless material list on the quotation page and send both in one submit', () => {
    const page = readFe('pages/contractor/CreateQuotationPage.tsx');
    assert.match(page, /materialRequirementApi\.create/);
    assert.match(page, /quotationApi\.create/);
    assert.match(page, /sendingRef/);
    assert.match(page, /addMaterial|mrl\.addItem/);
    assert.match(page, /removeMaterial/);
    assert.match(page, /startEditMaterial/);
    assert.match(page, /editingIndex/);
    assert.doesNotMatch(page, /mrl-row-name-/);
    assert.doesNotMatch(page, /material-requirements\/new/);
    assert.doesNotMatch(page, /mrl\.open/);
    assert.doesNotMatch(page, /id="mrl-store"/);
    assert.doesNotMatch(page, /eligibleStores/);
    assert.match(page, /quote\.mrlCount/);
    assert.match(page, /mrlInvalid/);
    assert.match(page, /normalizeMrlUnit|unitLooksLikeQuantity/);
    assert.doesNotMatch(page, /quote\.mrlInfo/);
    assert.doesNotMatch(page, /mrl\.unitFallback/);
    assert.match(page, /mrl\.specMissing/);
  });
});

describe('Flow 06 deposit 15/10/5/85', () => {
  it('splits 10_000_000 using the locked contractor rates', () => {
    assert.equal(DEPOSIT_RATE, 0.15);
    assert.equal(PLATFORM_FEE_RATE, 0.10);
    const snap = snapshotContractorQuote(10_000_000);
    assert.equal(snap.ok, true);
    assert.equal(snap.depositAmount, 1_500_000);
    assert.equal(snap.platformFee, 1_000_000);
    assert.equal(snap.contractorHold, 500_000);
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

describe('Flow 06 accept-and-deposit navigation', () => {
  it('sends the customer from quotation accept to payment, then to the order, without a pay CTA on order detail', () => {
    const quotePage = readFe('pages/customer/CustomerQuotationPage.tsx');
    const payPage = readFe('features/payments/pages/PaymentPage.tsx');
    const orderPage = readFe('pages/customer/CustomerOrderDetailPage.tsx');
    const timeline = readFe('features/orders/types/orderStatus.ts');
    const quoteService = readBe('services/quotationService.js');
    const paymentService = readBe('services/paymentService.js');
    assert.match(quoteService, /function packAccept/);
    assert.match(quoteService, /createDepositIntent/);
    assert.doesNotMatch(quoteService, /createFromQuotation/);
    assert.match(quotePage, /\/customer\/payment\/\$\{quote\.id\}/);
    assert.doesNotMatch(quotePage, /\/customer\/payment\/\$\{orderId\}/);
    assert.match(quotePage, /quotationApi\.accept/);
    assert.match(quotePage, /quote\.continueDeposit/);
    assert.match(payPage, /byQuotation/);
    assert.match(payPage, /payingRef/);
    assert.match(payPage, /pay\.dueNow|PaymentSummaryCard/);
    assert.doesNotMatch(orderPage, /pay\.cta/);
    assert.doesNotMatch(orderPage, /\/customer\/payment\//);
    assert.match(orderPage, /complaint\.open/);
    assert.match(timeline, /key: 'deposit'/);
    assert.match(paymentService, /customerOnly: true/);
    assert.match(paymentService, /withCaptureLock/);
    assert.match(paymentService, /listForQuotation/);
    assert.match(paymentService, /createFromQuotation/);
  });

  it('creates the contractor order only after a successful deposit capture', () => {
    const orderService = readBe('services/orderService.js');
    const paymentService = readBe('services/paymentService.js');
    const quoteService = readBe('services/quotationService.js');
    const contractorList = readBe('services/orderService.js');
    assert.match(orderService, /async function createDepositIntent/);
    assert.match(orderService, /ORDER_STATUS\.DEPOSIT_PAID/);
    assert.match(orderService, /quotationId: quotation\._id/);
    assert.doesNotMatch(quoteService, /createFromQuotation/);
    assert.match(paymentService, /createFromQuotation/);
    assert.match(paymentService, /ensureOrderForPaidDeposit/);
    assert.match(contractorList, /QUOTATION_ACCEPTED/);
    assert.match(orderService, /listForContractor[\s\S]{0,400}QUOTATION_ACCEPTED/);
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
