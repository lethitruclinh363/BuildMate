const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty, createUser, deleteFixtureUsers, ROLES } = require('./helpers/party');
const { testDatabaseReady, captureCommissionRules, restoreCommissionRules } = require('./helpers/pg-cleanup');
const { ORDER_STATUS } = require('../models/Order');
const { Order, Payment, Commission } = require('../repositories/commerceAccess');
const { signToken } = require('../services/authService');
const { customerAction } = require('../services/quotationService');
const { depositCheckoutBody } = require('./helpers/finance-http');
const commissionService = require('../services/commissionService');
const { invalidateAnalyticsCache } = require('../services/analyticsService');

describe('Sprint 6.1 finance, review, complaint, analytics', { timeout: 120000 }, () => {
  let dbReady = false;
  let server;
  const trash = [];
  let admin;
  let adminToken;
  let commissionSnapshot;

  before(async () => {
    commissionSnapshot = await captureCommissionRules();
    dbReady = testDatabaseReady();
    if (!dbReady) return;
    server = await startTestServer();
    await commissionService.getActiveRule();
    admin = await createUser({
      name: 'Sprint61 Admin',
      email: `e2e.admin61.${Date.now()}@buildmate.test`,
      password: 'Admin@1234',
      role: ROLES.ADMIN,
    });
    adminToken = signToken(admin);
  });

  after(async () => {
    await restoreCommissionRules(commissionSnapshot);
    for (const party of trash) await cleanupParty(party);
    if (admin) await deleteFixtureUsers([admin._id]);
    if (server) await server.close();
  });

  it('1. customer checkout own order → PENDING → PAID + escrow HELD, no deposit commission', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    await commissionService.setActivePercentage(10, 'Test 10%');
    const party = await createParty(`pay-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const paymentId = accepted.payment.id;

    const checkout = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: depositCheckoutBody(),
    });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.json.data.payment.status, 'PENDING');

    const paid = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: party.tokens.customer,
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.json.data.payment.status, 'PAID');
    assert.equal(paid.json.data.commission, null);
    assert.equal(paid.json.data.escrow.status, 'HELD');

    const commissions = await Commission.countDocuments({ paymentId });
    assert.equal(commissions, 0);
  });

  it('2. checkout twice does not duplicate PAID or commission', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`duppay-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const paymentId = accepted.payment.id;
    await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: depositCheckoutBody(),
    });
    const second = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: depositCheckoutBody(),
    });
    assert.equal(second.status, 409);

    await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: party.tokens.customer,
    });
    const again = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: party.tokens.customer,
    });
    assert.equal(again.status, 200);
    assert.equal(again.json.data.duplicated, true);
    assert.equal(await Payment.countDocuments({ orderId: accepted.order.id, status: 'PAID' }), 1);
    assert.equal(await Commission.countDocuments({ paymentId }), 0);
  });

  it('3. customer cannot checkout another customer payment (403)', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`idors-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const res = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${accepted.payment.id}/checkout`,
      token: party.tokens.stranger,
      body: {},
    });
    assert.equal(res.status, 403);
  });

  it('platform fee stays locked at 10% and deposit still posts no commission', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    await commissionService.setActivePercentage(10, 'Snap 10');
    const first = await createParty(`fee-a-${Date.now()}`);
    const second = await createParty(`fee-b-${Date.now() + 1}`);
    trash.push(first, second);
    const a = await customerAction(first.quotation._id, first.customer._id, 'accept');
    await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${a.payment.id}/checkout`,
      token: first.tokens.customer,
      body: depositCheckoutBody(),
    });
    const paidA = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${a.payment.id}/mock-success`,
      token: first.tokens.customer,
    });
    assert.equal(paidA.json.data.commission, null);
    assert.equal(paidA.json.data.escrow.status, 'HELD');

    await assert.rejects(
      () => commissionService.setActivePercentage(5, 'Snap 5'),
      (err) => err.statusCode === 422
    );
    await assert.rejects(
      () => commissionService.setActivePercentage(8, 'Snap 8'),
      (err) => err.statusCode === 422
    );
    const b = await customerAction(second.quotation._id, second.customer._id, 'accept');
    await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${b.payment.id}/checkout`,
      token: second.tokens.customer,
      body: depositCheckoutBody(),
    });
    const paidB = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${b.payment.id}/mock-success`,
      token: second.tokens.customer,
    });
    assert.equal(paidB.json.data.commission, null);
    assert.equal(await Commission.countDocuments({ paymentId: a.payment.id }), 0);
  });

  it('review completed order once; unfinished and duplicate are 409', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`rev-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');

    const early = await api(server.origin, {
      method: 'POST',
      path: '/api/reviews',
      token: party.tokens.customer,
      body: {
        orderId: String(accepted.order.id),
        targetUserId: String(party.contractor._id),
        rating: 5,
        comment: 'Too soon',
      },
    });
    assert.equal(early.status, 409);

    await Order.findByIdAndUpdate(accepted.order.id, {
      status: ORDER_STATUS.CUSTOMER_ACCEPTED,
      completedAt: new Date(),
    });

    const ok = await api(server.origin, {
      method: 'POST',
      path: '/api/reviews',
      token: party.tokens.customer,
      body: {
        orderId: String(accepted.order.id),
        targetUserId: String(party.contractor._id),
        rating: 4,
        comment: 'Good waterproofing work overall.',
      },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.rating, 4);

    const dup = await api(server.origin, {
      method: 'POST',
      path: '/api/reviews',
      token: party.tokens.customer,
      body: {
        orderId: String(accepted.order.id),
        targetUserId: String(party.contractor._id),
        rating: 5,
        comment: 'Second try',
      },
    });
    assert.equal(dup.status, 409);
  });

  it('complaint: party allowed, stranger 403, older than 7 days 409', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`cmp-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');

    const ok = await api(server.origin, {
      method: 'POST',
      path: '/api/complaints',
      token: party.tokens.customer,
      body: {
        orderId: String(accepted.order.id),
        againstUser: String(party.contractor._id),
        reason: 'QUALITY',
        description: 'Membrane looks uneven along the wet wall.',
      },
    });
    assert.equal(ok.status, 201);

    const stranger = await api(server.origin, {
      method: 'POST',
      path: '/api/complaints',
      token: party.tokens.stranger,
      body: {
        orderId: String(accepted.order.id),
        againstUser: String(party.contractor._id),
        reason: 'QUALITY',
        description: 'I am not on this order at all.',
      },
    });
    assert.equal(stranger.status, 403);

    const lateParty = await createParty(`late-${Date.now()}`);
    trash.push(lateParty);
    const late = await customerAction(lateParty.quotation._id, lateParty.customer._id, 'accept');
    await Order.findByIdAndUpdate(late.order.id, {
      status: ORDER_STATUS.CUSTOMER_ACCEPTED,
      completedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    const expired = await api(server.origin, {
      method: 'POST',
      path: '/api/complaints',
      token: lateParty.tokens.customer,
      body: {
        orderId: String(late.order.id),
        againstUser: String(lateParty.contractor._id),
        reason: 'DELAY',
        description: 'Trying to complain after the 7 day window.',
      },
    });
    assert.equal(expired.status, 409);
  });

  it('analytics: admin 200, customer 403', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    invalidateAnalyticsCache();
    const party = trash[0];
    const adminRes = await api(server.origin, { path: '/api/admin/analytics', token: adminToken });
    assert.equal(adminRes.status, 200);
    assert.equal(typeof adminRes.json.data.users.total, 'number');
    assert.equal(typeof adminRes.json.data.finance.revenue, 'number');
    assert.ok(adminRes.json.data.orders);
    assert.ok(adminRes.json.data.reviews);
    assert.ok(adminRes.json.data.complaints);

    const denied = await api(server.origin, {
      path: '/api/admin/analytics',
      token: party.tokens.customer,
    });
    assert.equal(denied.status, 403);
  });
});
