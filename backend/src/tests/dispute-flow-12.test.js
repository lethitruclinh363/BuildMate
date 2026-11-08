const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  snapshotContractorQuote,
  defaultEscrowRecord,
  applyDepositCaptured,
  freezeEscrow,
  canReleaseEscrow,
  holdCustomerCancel,
  markReleasePending,
  ESCROW_STATUS,
  CANCEL_CASE,
  DEPOSIT_RATE,
  PLATFORM_FEE_RATE,
} = require('../utils/contractor-finance');
const { COMPLAINT_STATUS } = require('../models/Complaint');
const { REVIEW_TARGET } = require('../models/Review');
const { reviewSchema, complaintSchema } = require('../validators/finance.validator');
const { COMPLAINT_TRANSITIONS, otherPartyId } = require('../services/complaintService');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const ADMIN_ROOT = path.resolve(__dirname, '../../../admin/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readAdmin(rel) {
  return fs.readFileSync(path.join(ADMIN_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Flow 12 contractor review rules', () => {
  it('allows a contractor review only after CUSTOMER_ACCEPTED and unique per party', () => {
    const service = readBe('services/reviewService.js');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    assert.match(service, /order\.status !== ORDER_STATUS\.CUSTOMER_ACCEPTED/);
    assert.match(service, /Only the customer can review this order/);
    assert.match(service, /You have already reviewed this party on the order/);
    assert.match(schema, /uq_reviews_party_per_order/);
    assert.equal(REVIEW_TARGET.CONTRACTOR, 'CONTRACTOR');
    assert.equal(reviewSchema.safeParse({ orderId: '64b0000000000000000000aa', targetUserId: '64b0000000000000000000bb', rating: 5 }).success, true);
    assert.equal(reviewSchema.safeParse({ orderId: '64b0000000000000000000aa', targetUserId: '64b0000000000000000000bb', rating: 0 }).success, false);
    assert.equal(reviewSchema.safeParse({ orderId: '64b0000000000000000000aa', targetUserId: '64b0000000000000000000bb', rating: 6 }).success, false);
    const page = readFe('pages/customer/CustomerOrderDetailPage.tsx');
    assert.match(page, /order\.status === 'CUSTOMER_ACCEPTED'/);
    assert.match(page, /\/customer\/orders\/\$\{order\.id\}\/review/);
  });

  it('notifies the reviewed contractor and does not expose a delete route', () => {
    const service = readBe('services/reviewService.js');
    const routes = readBe('routes/reviewRoutes.js');
    assert.match(service, /NOTIFICATION_TYPE\.NEW_REVIEW/);
    assert.match(service, /link: targetType === REVIEW_TARGET\.MATERIAL_STORE \? '\/store\/reviews' : '\/contractor\/reviews'/);
    assert.equal(routes.includes('router.delete'), false);
    assert.equal(routes.includes('router.patch'), false);
    assert.match(routes, /authorize\(ROLES\.CUSTOMER\)/);
  });
});

describe('Flow 12 material store review rules', () => {
  it('unmounts new material-order review creation and keeps historical review rows', () => {
    const service = readBe('services/reviewService.js');
    const routes = readBe('routes/reviewRoutes.js');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    assert.doesNotMatch(service, /createMaterialStoreReview|assertMaterialStoreReview/);
    assert.doesNotMatch(routes, /material-orders/);
    assert.match(service, /listStoreReviews/);
    assert.match(schema, /uq_reviews_material_order/);
    assert.match(schema, /material_order_id/);
  });

  it('keeps independent store reviews without a material-order purchase page', () => {
    const service = readBe('services/reviewService.js');
    assert.match(service, /REVIEW_TARGET\.MATERIAL_STORE/);
    assert.match(service, /listStoreReviews/);
    assert.match(service, /link: targetType === REVIEW_TARGET\.MATERIAL_STORE \? '\/store\/reviews'/);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'pages/customer/MaterialOrderDetailPage.tsx')), false);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'features/reviews/pages/CreateMaterialReviewPage.tsx')), false);
  });
});

describe('Flow 12 repair complaints', () => {
  it('starts OPEN and only admin can walk OPEN → PROCESSING → RESOLVED|REJECTED', () => {
    assert.deepEqual(Object.values(COMPLAINT_STATUS).sort(), ['OPEN', 'PROCESSING', 'REJECTED', 'RESOLVED']);
    assert.deepEqual(COMPLAINT_TRANSITIONS.OPEN, ['PROCESSING']);
    assert.deepEqual(COMPLAINT_TRANSITIONS.PROCESSING, ['RESOLVED', 'REJECTED']);
    assert.deepEqual(COMPLAINT_TRANSITIONS.RESOLVED, []);
    assert.deepEqual(COMPLAINT_TRANSITIONS.REJECTED, []);
    const admin = readAdmin('complaints/ComplaintDetailPage.tsx');
    assert.match(admin, /row\.status !== 'OPEN'/);
    assert.match(admin, /row\.status !== 'PROCESSING'/);
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const block = schema.slice(schema.indexOf('model complaints'), schema.indexOf('model contractor_documents'));
    assert.match(block, /service_order_id/);
    assert.doesNotMatch(block, /material_order_id/);
  });

  it('lets only the other party be named and keeps a seven-day window after acceptance', () => {
    const order = { customerId: 'cust', contractorId: 'crew' };
    assert.equal(otherPartyId(order, 'cust'), 'crew');
    assert.equal(otherPartyId(order, 'crew'), 'cust');
    const service = readBe('services/complaintService.js');
    assert.match(service, /You can only open a complaint against the other party/);
    assert.match(service, /Complaint window has closed/);
    assert.match(service, /WEEK_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
    assert.equal(
      complaintSchema.safeParse({
        orderId: '64b0000000000000000000aa',
        againstUser: '64b0000000000000000000bb',
        reason: 'QUALITY',
        description: 'Workmanship does not match the quotation.',
      }).success,
      true
    );
    assert.equal(
      complaintSchema.safeParse({
        orderId: '64b0000000000000000000aa',
        againstUser: '64b0000000000000000000bb',
        reason: 'QUALITY',
        description: 'short',
      }).success,
      false
    );
  });

  it('does not implement a material-order complaint path', () => {
    const service = readBe('services/complaintService.js');
    const routes = readBe('routes/complaintRoutes.js');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    assert.doesNotMatch(service, /materialOrderId|MaterialOrder/);
    assert.doesNotMatch(routes, /material/);
    assert.doesNotMatch(schema, /model material_complaints/);
  });
});

describe('Flow 12 escrow freeze and settle', () => {
  function funded() {
    return applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow;
  }

  it('keeps 15/5/10/85 and freezes HELD escrow when a complaint opens', () => {
    assert.equal(DEPOSIT_RATE, 0.15);
    assert.equal(PLATFORM_FEE_RATE, 0.05);
    const frozen = freezeEscrow(funded());
    assert.equal(frozen.escrow.status, ESCROW_STATUS.FROZEN);
    assert.equal(frozen.escrow.cancelCase, CANCEL_CASE.DISPUTE);
    assert.equal(
      canReleaseEscrow({
        escrow: frozen.escrow,
        customerAccepted: true,
        remainingSettled: true,
        openComplaint: true,
      }).code,
      'ESCROW_FROZEN_BY_COMPLAINT'
    );
  });

  it('does not auto-payout a closed dispute and still requires remaining 85%', () => {
    const frozen = freezeEscrow(funded());
    assert.equal(
      canReleaseEscrow({
        escrow: frozen.escrow,
        customerAccepted: true,
        remainingSettled: false,
        openComplaint: false,
      }).ok,
      false
    );
    assert.equal(
      canReleaseEscrow({
        escrow: frozen.escrow,
        customerAccepted: true,
        remainingSettled: true,
        openComplaint: false,
      }).ok,
      true
    );
    assert.equal(markReleasePending(frozen.escrow).escrow.status, ESCROW_STATUS.RELEASE_PENDING);
    const customerHold = holdCustomerCancel(funded(), 'Customer cancelled');
    assert.equal(
      canReleaseEscrow({
        escrow: customerHold.escrow,
        customerAccepted: true,
        remainingSettled: true,
        openComplaint: false,
      }).ok,
      false
    );
  });

  it('re-checks open complaints inside the settle lock and unfreezes only via admin settle', () => {
    const escrow = readBe('services/escrowService.js');
    const complaint = readBe('services/complaintService.js');
    assert.match(escrow, /if \(await hasOpenComplaint\(order\._id\)\) \{/);
    assert.match(escrow, /await escrowStore\.lockByPayment\(payment, tx\);/);
    assert.match(escrow, /current\.status === ESCROW_STATUS\.HELD \|\| current\.status === ESCROW_STATUS\.FROZEN/);
    assert.doesNotMatch(complaint, /releaseEscrow|settle\(/);
    assert.match(complaint, /freezeIfComplaint/);
    assert.match(complaint, /findUsersByRole\('ADMIN'\)/);
    assert.match(complaint, /\/complaints\/\$\{complaint\._id\}/);
    assert.match(complaint, /\/customer\/complaints/);
  });
});

describe('Flow 12 HTTP auth when API is up', () => {
  it('rejects unauthenticated review and complaint writes', async (t) => {
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
    const review = await fetch(`${origin}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '000000000000000000000000',
        targetUserId: '000000000000000000000001',
        rating: 5,
      }),
    });
    const material = await fetch(`${origin}/api/reviews/material-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialOrderId: '000000000000000000000000', rating: 5 }),
    });
    const complaint = await fetch(`${origin}/api/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: '000000000000000000000000',
        againstUser: '000000000000000000000001',
        reason: 'QUALITY',
        description: 'Unauthenticated complaint payload for ACL.',
      }),
    });
    const admin = await fetch(`${origin}/api/admin/complaints`);
    assert.equal(review.status, 401);
    assert.equal(material.status, 404);
    assert.equal(complaint.status, 401);
    assert.equal(admin.status, 401);
  });
});

describe('Flow 12 isolated Postgres journeys', () => {
  it('skips live review and complaint HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Covered by review/complaint HTTP when isolated Postgres is up');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
