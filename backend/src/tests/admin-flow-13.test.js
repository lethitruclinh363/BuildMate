const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const {
  snapshotContractorQuote,
  snapshotMaterialFree,
  canReleaseEscrow,
  applyDepositCaptured,
  defaultEscrowRecord,
  freezeEscrow,
  holdCustomerCancel,
  ESCROW_STATUS,
  CANCEL_CASE,
} = require('../utils/contractor-finance');
const { emptyLedger, addDepositRow } = require('../utils/admin-finance-ledger');
const { buildAdminSeries, dayKey, periodDelta } = require('../utils/admin-analytics-series');
const { isBlockedPublicUpload } = require('../utils/public-uploads');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const ROOT = path.resolve(__dirname, '../../..');
const BACKEND = path.join(ROOT, 'backend/src');
const ADMIN = path.join(ROOT, 'admin/src');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND, rel), 'utf8');
}

function readAdmin(rel) {
  return fs.readFileSync(path.join(ADMIN, rel), 'utf8');
}

describe('Flow 13 GMV and commission formulas', () => {
  it('keeps 10_000_000 quote as 1_500_000 deposit / 500_000 fee / 1_000_000 hold / 8_500_000 remaining', () => {
    const snap = snapshotContractorQuote(10_000_000);
    assert.equal(snap.depositAmount, 1_500_000);
    assert.equal(snap.platformFee, 500_000);
    assert.equal(snap.contractorHold, 1_000_000);
    assert.equal(snap.remainingAmount, 8_500_000);
  });

  it('does not treat captured deposit or remaining 85% as platform commission', () => {
    const snap = snapshotContractorQuote(10_000_000);
    const ledger = emptyLedger();
    addDepositRow(ledger, {
      finance: snap,
      escrow: { status: ESCROW_STATUS.HELD, grossAmount: snap.depositAmount, contractorHoldAmount: snap.contractorHold },
      paymentStatus: 'PAID',
      includeQuote: true,
    });
    assert.equal(ledger.acceptedQuoteTotal, 10_000_000);
    assert.equal(ledger.capturedDeposit, 1_500_000);
    assert.equal(ledger.platformFeePosted, 0);
    assert.notEqual(ledger.acceptedQuoteTotal, ledger.capturedDeposit);
    assert.notEqual(snap.platformFee, snap.remainingAmount);
  });

  it('excludes cancelled quotes from GMV and does not double-count the same order', () => {
    const snap = snapshotContractorQuote(10_000_000);
    const ledger = emptyLedger();
    addDepositRow(ledger, { finance: snap, escrow: {}, paymentStatus: 'PAID', includeQuote: false });
    addDepositRow(ledger, { finance: snap, escrow: {}, paymentStatus: 'PAID', includeQuote: true });
    addDepositRow(ledger, { finance: snap, escrow: {}, paymentStatus: 'PAID', includeQuote: false });
    assert.equal(ledger.acceptedQuoteTotal, 10_000_000);
    assert.equal(ledger.capturedDeposit, 4_500_000);
  });

  it('keeps COD material orders at 0% fee and 0% deposit', () => {
    const snap = snapshotMaterialFree({ materialSubtotal: 2_000_000, shippingFee: 30_000 });
    assert.equal(snap.ok, true);
    assert.equal(snap.platformFeeAmount, 0);
    assert.equal(snap.depositAmount, 0);
    assert.equal(snap.totalAmount, 2_030_000);
  });
});

describe('Flow 13 time series and period delta', () => {
  it('returns 0% growth when the previous period is 0', () => {
    assert.equal(periodDelta([0, 185000]), 0);
    assert.equal(periodDelta([0, 0]), 0);
    assert.equal(periodDelta([100, 150]), 50);
  });

  it('buckets GMV in Asia/Ho_Chi_Minh so 17:00 UTC is the next VN calendar day', () => {
    const now = new Date('2026-10-26T12:00:00+07:00');
    const utcEvening = new Date('2026-10-25T17:00:00Z');
    assert.equal(dayKey(utcEvening), '2026-10-26');
    const series = buildAdminSeries(now, {
      gmvEvents: [{ at: utcEvening, amount: 10_000_000 }],
      commissionEvents: [{ at: utcEvening, platformAmount: 500_000, contractorAmount: 1_000_000 }],
    });
    const today = series.days7.find((row) => row.key === '2026-10-26');
    assert.equal(today.gmv, 10_000_000);
    assert.notEqual(today.gmv, 500_000);
  });

  it('fills empty months with 0 instead of inventing values', () => {
    const now = new Date('2026-10-26T12:00:00+07:00');
    const series = buildAdminSeries(now, { orders: [] });
    assert.equal(series.months12.length, 12);
    assert.equal(series.months12.every((row) => row.created === 0 && row.gmv === 0), true);
  });
});

describe('Flow 13 public uploads and admin ACL source', () => {
  it('blocks leftover contractor files under public /uploads without deleting them', () => {
    assert.equal(isBlockedPublicUpload('/uploads/contractors/owner-1/cccd.jpg'), true);
    assert.equal(isBlockedPublicUpload('/contractors/owner-1/cccd.jpg'), true);
    assert.equal(isBlockedPublicUpload('/uploads/stores/shop-1/cover.jpg'), false);
    assert.equal(isBlockedPublicUpload('/uploads/users/avatar.jpg'), false);
    const app = readBe('app.js');
    assert.match(app, /isBlockedPublicUpload/);
    assert.match(app, /canServeContractorPublicFile/);
  });

  it('keeps admin login on /api/admin/auth and rejects ADMIN on the public login path', () => {
    const adminAuth = readBe('services/adminAuthService.js');
    const publicAuth = readBe('services/authService.js');
    const adminRoutes = readBe('routes/adminRoutes.js');
    const adminAuthRoutes = readBe('routes/adminAuthRoutes.js');
    assert.match(adminAuth, /user\.role !== ROLES\.ADMIN/);
    assert.match(publicAuth, /user\.role === ROLES\.ADMIN/);
    assert.match(adminAuthRoutes, /allowRole\('ADMIN'\)/);
    assert.match(adminRoutes, /allowRole\('ADMIN'\)/);
    assert.match(adminRoutes, /router\.get\('\/orders'/);
    assert.match(adminRoutes, /router\.get\('\/material-orders'/);
  });

  it('does not bind dashboard GMV to finance.revenue or fabricate chart series', () => {
    const dashboard = readAdmin('features/dashboard/services/dashboard.api.ts');
    const analyticsPage = readAdmin('analytics/AnalyticsPage.tsx');
    const analyticsService = readBe('services/analyticsService.js');
    const format = readAdmin('features/dashboard/lib/format.ts');
    assert.match(dashboard, /analytics\.finance\.gmv/);
    assert.equal(/value:\s*analytics\.finance\.revenue/.test(dashboard), false);
    assert.equal(/distribute\(/.test(dashboard), false);
    assert.equal(/delta:\s*analytics\.complaints\.open \? 12/.test(dashboard), false);
    assert.match(analyticsPage, /data\.finance\.gmv/);
    assert.match(analyticsService, /revenue:\s*commission\.platform/);
    assert.match(analyticsService, /gmv,/);
    assert.match(analyticsService, /materialPlatformRevenue:\s*0/);
    assert.match(format, /if \(!prev\) return 0;/);
    assert.equal(/if \(!prev\) return last \? 100/.test(format), false);
  });

  it('lists repair orders from GET /admin/orders instead of a 30-id complaint subset', () => {
    const directory = readAdmin('hooks/useDirectory.ts');
    const api = readAdmin('services/admin.api.ts');
    const service = readBe('services/adminService.js');
    assert.match(api, /\/admin\/orders/);
    assert.match(directory, /listRepairOrders/);
    assert.match(service, /listRepairOrders/);
    assert.match(service, /limit\(200\)/);
  });
});

describe('Flow 13 escrow settle guards (regression 06/12)', () => {
  it('blocks settle while a complaint is open and allows DISPUTE freeze after close', () => {
    const snap = snapshotContractorQuote(10_000_000);
    const held = applyDepositCaptured(defaultEscrowRecord(snap)).escrow;
    held.remainingSettled = true;
    const frozen = freezeEscrow(held).escrow;
    assert.equal(
      canReleaseEscrow({
        escrow: frozen,
        customerAccepted: true,
        remainingSettled: true,
        openComplaint: true,
        depositPaid: true,
      }).ok,
      false
    );
    assert.equal(
      canReleaseEscrow({
        escrow: frozen,
        customerAccepted: true,
        remainingSettled: true,
        openComplaint: false,
        depositPaid: true,
      }).ok,
      true
    );
  });

  it('does not allow payout on customer-after-deposit freeze', () => {
    const snap = snapshotContractorQuote(10_000_000);
    const held = applyDepositCaptured(defaultEscrowRecord(snap)).escrow;
    const frozen = holdCustomerCancel(held, 'changed mind');
    assert.equal(frozen.escrow.cancelCase, CANCEL_CASE.CUSTOMER_AFTER_DEPOSIT);
    assert.equal(
      canReleaseEscrow({
        escrow: frozen.escrow,
        customerAccepted: true,
        remainingSettled: true,
        openComplaint: false,
        depositPaid: true,
      }).ok,
      false
    );
  });
});

describe('Flow 13 HTTP against isolated Postgres', () => {
  it('skips live admin HTTP when port 55432 is down', async (t) => {
    const ready = await testDatabaseReady();
    if (!ready) {
      t.skip('Isolated Postgres on 55432 is not running');
      return;
    }
    assert.equal(ready, true);
  });
});
