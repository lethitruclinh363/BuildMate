const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureMongo, mongoSkip, stopMongo } = require('./helpers/mongo');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty } = require('./helpers/party');
const { User, ROLES, USER_STATUS } = require('../models/User');
const { Order, ORDER_STATUS } = require('../models/Order');
const { Payment } = require('../models/Payment');
const { Commission } = require('../models/Commission');
const { signToken } = require('../services/authService');
const commissionService = require('../services/commissionService');
const { invalidateAnalyticsCache } = require('../services/analyticsService');

async function progressAll(origin, token, orderId) {
  for (const status of ['STARTED', 'IN_PROGRESS', 'COMPLETED']) {
    const res = await api(origin, {
      method: 'POST',
      path: `/api/orders/${orderId}/progress`,
      token,
      body: { status, description: `Site ${status.toLowerCase()} update for QA.` },
    });
    assert.equal(res.status, 201, `progress ${status} ${res.status} ${res.json?.message}`);
  }
}

describe('Sprint 6.3 business E2E + integrity', { timeout: 180000 }, () => {
  let dbReady = false;
  let server;
  const trash = [];
  let admin;
  let adminToken;

  before(async () => {
    dbReady = await ensureMongo();
    if (!dbReady) return;
    server = await startTestServer();
    await commissionService.setActivePercentage(5, 'Sprint 6.3 5%');
    admin = await User.create({
      name: 'Sprint63 Admin',
      email: `e2e.admin63.${Date.now()}@buildmate.test`,
      password: 'Admin@1234',
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
    });
    adminToken = signToken(admin);
  });

  after(async () => {
    for (const party of trash) await cleanupParty(party);
    if (admin) await User.deleteOne({ _id: admin._id });
    if (server) await server.close();
    await stopMongo();
  });

  it('full HTTP journey: login → quote accept → pay → assign → progress → complete → review → complaint → admin', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    const party = await createParty(`flow63-${Date.now()}`);
    trash.push(party);
    const origin = server.origin;

    const login = await api(origin, {
      method: 'POST',
      path: '/api/auth/login',
      body: { email: party.customer.email, password: 'Demo@1234' },
    });
    assert.equal(login.status, 200);
    const customer = login.json.data.token;
    assert.ok(customer);

    const nearby = await api(origin, {
      path: '/api/location/contractors/nearby?lat=10.0452&lng=105.7469&radius=10',
    });
    assert.equal(nearby.status, 200);

    const rooms = await api(origin, { path: '/api/chat/rooms', token: customer });
    assert.equal(rooms.status, 200);

    const accepted = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${party.quotation._id}/accept`,
      token: customer,
    });
    assert.equal(accepted.status, 200);
    const orderId = accepted.json.data.order.id;
    const paymentId = accepted.json.data.payment.id;
    assert.equal(accepted.json.data.order.status, 'QUOTATION_ACCEPTED');
    assert.equal(accepted.json.data.payment.status, 'UNPAID');

    const checkout = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: customer,
      body: { method: 'MOCK' },
    });
    assert.equal(checkout.status, 200);
    const paid = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: customer,
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.json.data.payment.status, 'PAID');
    assert.equal(paid.json.data.commission.status, 'POSTED');

    await progressAll(origin, party.tokens.contractor, orderId);

    const done = await api(origin, {
      method: 'POST',
      path: `/api/orders/${orderId}/complete`,
      token: customer,
    });
    assert.equal(done.status, 200);
    assert.equal(done.json.data.order.status, 'CUSTOMER_ACCEPTED');

    const review = await api(origin, {
      method: 'POST',
      path: '/api/reviews',
      token: customer,
      body: {
        orderId,
        targetUserId: String(party.contractor._id),
        rating: 5,
        comment: 'Waterproofing held after the first rain.',
      },
    });
    assert.equal(review.status, 201);

    const complaint = await api(origin, {
      method: 'POST',
      path: '/api/complaints',
      token: customer,
      body: {
        orderId,
        againstUser: String(party.contractor._id),
        reason: 'QUALITY',
        description: 'Small leak remains near the floor drain after handover.',
      },
    });
    assert.equal(complaint.status, 201);
    const complaintId = complaint.json.data.id;

    const earnings = await api(origin, { path: '/api/contractor/earnings', token: party.tokens.contractor });
    assert.equal(earnings.status, 200);
    assert.equal(earnings.json.data.netEarning, 712500);
    assert.equal(earnings.json.data.totalCommission, 37500);

    const reputation = await api(origin, { path: `/api/reviews/user/${party.contractor._id}` });
    assert.equal(reputation.status, 200);
    assert.equal(reputation.json.data.average, 5);
    assert.equal(reputation.json.data.count, 1);

    invalidateAnalyticsCache();
    const analytics = await api(origin, { path: '/api/admin/analytics', token: adminToken });
    assert.equal(analytics.status, 200);
    assert.ok(analytics.json.data.finance.revenue >= 750000);

    const adminPay = await api(origin, { path: `/api/payments/order/${orderId}`, token: adminToken });
    assert.equal(adminPay.status, 200);
    assert.equal(adminPay.json.data.summary.status, 'PAID');

    const process = await api(origin, {
      method: 'PATCH',
      path: `/api/admin/complaints/${complaintId}`,
      token: adminToken,
      body: { status: 'PROCESSING' },
    });
    assert.equal(process.status, 200);
    const resolved = await api(origin, {
      method: 'PATCH',
      path: `/api/admin/complaints/${complaintId}`,
      token: adminToken,
      body: { status: 'RESOLVED', adminNote: 'Membrane patched; case closed for demo.' },
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.json.data.status, 'RESOLVED');
  });

  it('finance: double checkout blocked; mock-success idempotent; refund reverses commission', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    const party = await createParty(`fin63-${Date.now()}`);
    trash.push(party);
    const origin = server.origin;
    const accept = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${party.quotation._id}/accept`,
      token: party.tokens.customer,
    });
    const paymentId = accept.json.data.payment.id;
    const orderId = accept.json.data.order.id;

    await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: { method: 'MOCK' },
    });
    const twice = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: { method: 'MOCK' },
    });
    assert.equal(twice.status, 409);

    const first = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: party.tokens.customer,
    });
    const second = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: party.tokens.customer,
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.json.data.duplicated, true);
    assert.equal(await Payment.countDocuments({ orderId, status: 'PAID' }), 1);
    assert.equal(await Commission.countDocuments({ paymentId }), 1);

    const refund = await api(origin, {
      method: 'POST',
      path: `/api/admin/payments/${paymentId}/refund`,
      token: adminToken,
      body: { reason: 'QA refund path' },
    });
    assert.equal(refund.status, 200);
    assert.equal(refund.json.data.status, 'REFUNDED');
    const commission = await Commission.findOne({ paymentId });
    assert.equal(commission.status, 'REVERSED');

    const again = await api(origin, {
      method: 'POST',
      path: `/api/admin/payments/${paymentId}/refund`,
      token: adminToken,
      body: { reason: 'second refund' },
    });
    assert.equal(again.status, 409);

    const earnings = await api(origin, { path: '/api/contractor/earnings', token: party.tokens.contractor });
    assert.equal(earnings.json.data.netEarning, 0);
  });

  it('order COMPLETED may stay UNPAID — no commission until PAID', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    const party = await createParty(`unpaid63-${Date.now()}`);
    trash.push(party);
    const origin = server.origin;
    const accept = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${party.quotation._id}/accept`,
      token: party.tokens.customer,
    });
    const orderId = accept.json.data.order.id;
    assert.equal(accept.json.data.payment.status, 'UNPAID');

    await progressAll(origin, party.tokens.contractor, orderId);

    const done = await api(origin, {
      method: 'POST',
      path: `/api/orders/${orderId}/complete`,
      token: party.tokens.customer,
    });
    assert.equal(done.status, 200);
    assert.equal(done.json.data.order.status, ORDER_STATUS.CUSTOMER_ACCEPTED);
    const order = await Order.findById(orderId);
    assert.equal(order.paymentStatus, 'UNPAID');
    assert.equal(await Commission.countDocuments({ orderId }), 0);
  });

  it('reviews: completed PASS, unfinished FAIL, duplicate FAIL, stranger FAIL, average accurate', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    const party = await createParty(`rev63-${Date.now()}`);
    trash.push(party);
    const origin = server.origin;
    const accept = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${party.quotation._id}/accept`,
      token: party.tokens.customer,
    });
    const orderId = accept.json.data.order.id;
    const body = {
      orderId,
      targetUserId: String(party.contractor._id),
      rating: 4,
      comment: 'Decent work on the wet wall.',
    };

    const early = await api(origin, { method: 'POST', path: '/api/reviews', token: party.tokens.customer, body });
    assert.equal(early.status, 409);

    await Order.findByIdAndUpdate(orderId, { status: ORDER_STATUS.CUSTOMER_ACCEPTED, completedAt: new Date() });

    const stranger = await api(origin, { method: 'POST', path: '/api/reviews', token: party.tokens.stranger, body });
    assert.equal(stranger.status, 403);

    const ok = await api(origin, { method: 'POST', path: '/api/reviews', token: party.tokens.customer, body });
    assert.equal(ok.status, 201);

    const dup = await api(origin, { method: 'POST', path: '/api/reviews', token: party.tokens.customer, body });
    assert.equal(dup.status, 409);

    const list = await api(origin, { path: `/api/reviews/user/${party.contractor._id}` });
    assert.equal(list.json.data.average, 4);
    assert.equal(list.json.data.count, 1);
  });

  it('complaints: party PASS, stranger FAIL, late FAIL, OPEN cannot skip to RESOLVED', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    const party = await createParty(`cmp63-${Date.now()}`);
    trash.push(party);
    const origin = server.origin;
    const accept = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${party.quotation._id}/accept`,
      token: party.tokens.customer,
    });
    const orderId = accept.json.data.order.id;
    const payload = {
      orderId,
      againstUser: String(party.contractor._id),
      reason: 'DELAY',
      description: 'Crew arrived a day later than the quotation estimate.',
    };

    const ok = await api(origin, { method: 'POST', path: '/api/complaints', token: party.tokens.customer, body: payload });
    assert.equal(ok.status, 201);

    const skip = await api(origin, {
      method: 'PATCH',
      path: `/api/admin/complaints/${ok.json.data.id}`,
      token: adminToken,
      body: { status: 'RESOLVED', adminNote: 'Illegal skip' },
    });
    assert.equal(skip.status, 409);

    const stranger = await api(origin, {
      method: 'POST',
      path: '/api/complaints',
      token: party.tokens.stranger,
      body: payload,
    });
    assert.equal(stranger.status, 403);

    const lateParty = await createParty(`late63-${Date.now()}`);
    trash.push(lateParty);
    const late = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${lateParty.quotation._id}/accept`,
      token: lateParty.tokens.customer,
    });
    await Order.findByIdAndUpdate(late.json.data.order.id, {
      status: ORDER_STATUS.CUSTOMER_ACCEPTED,
      completedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    const expired = await api(origin, {
      method: 'POST',
      path: '/api/complaints',
      token: lateParty.tokens.customer,
      body: {
        orderId: late.json.data.order.id,
        againstUser: String(lateParty.contractor._id),
        reason: 'QUALITY',
        description: 'Trying to open a complaint after seven days.',
      },
    });
    assert.equal(expired.status, 409);
  });

  it('RBAC: customer/contractor cannot use admin or foreign finance APIs; JWT rejects garbage', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    const party = await createParty(`rbac63-${Date.now()}`);
    trash.push(party);
    const origin = server.origin;
    const accept = await api(origin, {
      method: 'PATCH',
      path: `/api/quotations/${party.quotation._id}/accept`,
      token: party.tokens.customer,
    });
    const paymentId = accept.json.data.payment.id;
    const orderId = accept.json.data.order.id;
    const { customer, contractor, stranger } = party.tokens;

    assert.equal((await api(origin, { path: '/api/admin/analytics', token: customer })).status, 403);
    assert.equal((await api(origin, { path: '/api/admin/complaints', token: contractor })).status, 403);
    assert.equal((await api(origin, { path: '/api/admin/analytics', token: stranger })).status, 403);
    assert.equal((await api(origin, { path: '/api/contractor/earnings', token: stranger })).status, 403);
    assert.equal((await api(origin, { path: '/api/contractor/earnings', token: customer })).status, 403);
    assert.equal(
      (
        await api(origin, {
          method: 'POST',
          path: `/api/admin/payments/${paymentId}/refund`,
          token: customer,
          body: { reason: 'no' },
        })
      ).status,
      403
    );
    assert.equal((await api(origin, { path: `/api/payments/order/${orderId}`, token: stranger })).status, 403);
    assert.equal((await api(origin, { path: '/api/admin/audit-logs', token: adminToken })).status, 200);
    assert.equal((await api(origin, { path: '/api/orders/customer', token: 'not-a-jwt' })).status, 401);
    assert.equal((await api(origin, { path: '/api/v1/health' })).status, 200);
  });
});
