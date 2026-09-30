const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureMongo, mongoSkip, stopMongo } = require('./helpers/mongo');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty } = require('./helpers/party');
const { User, ROLES, USER_STATUS } = require('../models/User');
const { Order, ORDER_STATUS } = require('../models/Order');
const { Payment } = require('../models/Payment');
const { Commission } = require('../models/Commission');
const { Review } = require('../models/Review');
const { Complaint } = require('../models/Complaint');
const { signToken } = require('../services/auth.service');
const { customerAction } = require('../services/quotation.service');
const commissionService = require('../services/commission.service');
const { invalidateAnalyticsCache } = require('../services/analytics.service');

describe('Sprint 6.1 finance, review, complaint, analytics', { timeout: 120000 }, () => {
  let dbReady = false;
  let server;
  const trash = [];
  let admin;
  let adminToken;

  before(async () => {
    dbReady = await ensureMongo();
    if (!dbReady) return;
    server = await startTestServer();
    await commissionService.getActiveRule();
    admin = await User.create({
      name: 'Sprint61 Admin',
      email: `e2e.admin61.${Date.now()}@buildmate.test`,
      password: 'Admin@1234',
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
    });
    adminToken = signToken(admin);
  });

  after(async () => {
    for (const party of trash) {
      const order = await Order.findOne({ quotationId: party.quotation._id });
      if (order) {
        await Promise.all([
          Commission.deleteMany({ orderId: order._id }),
          Review.deleteMany({ orderId: order._id }),
          Complaint.deleteMany({ orderId: order._id }),
        ]);
      }
      await cleanupParty(party);
    }
    if (admin) await User.deleteOne({ _id: admin._id });
    if (server) await server.close();
    await stopMongo();
  });

  it('1. customer checkout own order → PENDING → PAID + commission 5%', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    await commissionService.setActivePercentage(5, 'Test 5%');
    const party = await createParty(`pay-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const paymentId = accepted.payment.id;

    const checkout = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: { method: 'MOCK' },
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
    assert.equal(paid.json.data.commission.rateSnapshot, 5);
    assert.equal(paid.json.data.commission.platformAmount, 37500);
    assert.equal(paid.json.data.commission.contractorAmount, 712500);

    const commissions = await Commission.countDocuments({ paymentId });
    assert.equal(commissions, 1);
  });

  it('2. checkout twice does not duplicate PAID or commission', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
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
      body: {},
    });
    const second = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: party.tokens.customer,
      body: {},
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
    assert.equal(await Commission.countDocuments({ paymentId }), 1);
  });

  it('3. customer cannot checkout another customer payment (403)', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
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

  it('commission snapshot stays 5 after fee changes to 8', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }
    await commissionService.setActivePercentage(5, 'Snap 5');
    const first = await createParty(`fee-a-${Date.now()}`);
    const second = await createParty(`fee-b-${Date.now() + 1}`);
    trash.push(first, second);
    const a = await customerAction(first.quotation._id, first.customer._id, 'accept');
    await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${a.payment.id}/checkout`,
      token: first.tokens.customer,
      body: {},
    });
    const paidA = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${a.payment.id}/mock-success`,
      token: first.tokens.customer,
    });
    assert.equal(paidA.json.data.commission.rateSnapshot, 5);

    await commissionService.setActivePercentage(8, 'Snap 8');
    const b = await customerAction(second.quotation._id, second.customer._id, 'accept');
    await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${b.payment.id}/checkout`,
      token: second.tokens.customer,
      body: {},
    });
    const paidB = await api(server.origin, {
      method: 'POST',
      path: `/api/payments/${b.payment.id}/mock-success`,
      token: second.tokens.customer,
    });
    assert.equal(paidB.json.data.commission.rateSnapshot, 8);
    const old = await Commission.findOne({ paymentId: a.payment.id });
    assert.equal(old.rateSnapshot, 5);
  });

  it('review completed order once; unfinished and duplicate are 409', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
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
      t.skip(mongoSkip());
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
      t.skip(mongoSkip());
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
