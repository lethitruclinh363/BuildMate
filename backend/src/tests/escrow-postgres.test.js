const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty, createUser, ROLES } = require('./helpers/party');
const { testDatabaseReady, deleteFixtureUsers } = require('./helpers/pg-cleanup');
const { depositCheckoutBody } = require('./helpers/finance-http');
const { signToken } = require('../services/authService');
const { customerAction } = require('../services/quotationService');
const { Payment, Commission, runInTransaction } = require('../repositories/commerceAccess');
const { snapshotContractorQuote, snapshotMaterialFree } = require('../utils/contractor-finance');

describe('contractor escrow on isolated PostgreSQL', { timeout: 120000 }, () => {
  let dbReady = false;
  let server;
  let admin;
  const trash = [];

  before(async () => {
    dbReady = testDatabaseReady();
    if (!dbReady) return;
    server = await startTestServer();
    admin = await createUser({
      name: 'Escrow Admin',
      email: `escrow.admin.${Date.now()}@buildmate.test`,
      password: 'Admin@1234',
      role: ROLES.ADMIN,
    });
  });

  after(async () => {
    for (const party of trash) await cleanupParty(party);
    if (admin) await deleteFixtureUsers([admin._id]);
    if (server) await server.close();
  });

  async function payDeposit(origin, token, paymentId) {
    const checkout = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token,
      body: depositCheckoutBody(),
    });
    assert.equal(checkout.status, 200, checkout.json?.message);
    const paid = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token,
    });
    assert.equal(paid.status, 200, paid.json?.message);
    return paid;
  }

  it('creates a contractor order, captures a 15% mock deposit, holds escrow, then posts 5% once with a 10% payout', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`escrow-10m-${Date.now()}`, { totalCost: 10_000_000 });
    trash.push(party);
    const origin = server.origin;
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    assert.equal(accepted.payment.type, 'DEPOSIT');
    assert.equal(accepted.payment.amount, 1_500_000);
    const snap = snapshotContractorQuote(10_000_000);
    assert.equal(snap.platformFee, 500_000);
    assert.equal(snap.contractorHold, 1_000_000);
    assert.equal(snap.depositAmount, snap.platformFee + snap.contractorHold);

    const paid = await payDeposit(origin, party.tokens.customer, accepted.payment.id);
    assert.equal(paid.json.data.escrow.status, 'HELD');
    assert.equal(await Commission.countDocuments({ paymentId: accepted.payment.id }), 0);

    const remaining = await api(origin, {
      method: 'POST',
      path: `/api/orders/${accepted.order.id}/remaining-received`,
      token: party.tokens.customer,
    });
    assert.equal(remaining.status, 200);

    for (const status of ['STARTED', 'IN_PROGRESS', 'COMPLETED']) {
      const progress = await api(origin, {
        method: 'POST',
        path: `/api/orders/${accepted.order.id}/progress`,
        token: party.tokens.contractor,
        body: { status, description: `Site ${status}` },
      });
      assert.equal(progress.status, 201, progress.json?.message);
    }
    const done = await api(origin, {
      method: 'POST',
      path: `/api/orders/${accepted.order.id}/complete`,
      token: party.tokens.customer,
    });
    assert.equal(done.status, 200);

    const adminToken = signToken(admin);
    const settle = await api(origin, {
      method: 'POST',
      path: `/api/admin/orders/${accepted.order.id}/escrow/settle`,
      token: adminToken,
    });
    assert.equal(settle.status, 200, settle.json?.message);
    assert.equal(settle.json.data.mock, true);
    const live = await Payment.findById(accepted.payment.id);
    const escrow = live.metadata.escrow;
    assert.equal(escrow.status, 'RELEASED');
    assert.equal(Number(escrow.releasedAmount), 1_000_000);
    assert.equal(Number(escrow.refundedAmount || 0) + Number(escrow.releasedAmount) <= Number(escrow.grossAmount), true);
    const commission = await Commission.findOne({ paymentId: accepted.payment.id });
    assert.equal(commission.status, 'POSTED');
    assert.equal(Number(commission.platformAmount), 500_000);

    const again = await api(origin, {
      method: 'POST',
      path: `/api/admin/orders/${accepted.order.id}/escrow/settle`,
      token: adminToken,
    });
    assert.equal(again.status, 409);

    const contractorSettle = await api(origin, {
      method: 'POST',
      path: `/api/admin/orders/${accepted.order.id}/escrow/settle`,
      token: party.tokens.contractor,
    });
    assert.equal(contractorSettle.status, 403);
  });

  it('mock-refunds the full 15% once and refuses a second refund', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`escrow-ref-${Date.now()}`, { totalCost: 10_000_000 });
    trash.push(party);
    const origin = server.origin;
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    await payDeposit(origin, party.tokens.customer, accepted.payment.id);
    const adminToken = signToken(admin);
    const first = await api(origin, {
      method: 'POST',
      path: `/api/admin/orders/${accepted.order.id}/escrow/refund`,
      token: adminToken,
      body: { reason: 'Contractor cancelled in test', cancelCase: 'CONTRACTOR_CANCEL' },
    });
    assert.equal(first.status, 200, first.json?.message);
    const second = await api(origin, {
      method: 'POST',
      path: `/api/admin/orders/${accepted.order.id}/escrow/refund`,
      token: adminToken,
      body: { reason: 'second' },
    });
    assert.equal(second.status, 409);
    const settle = await api(origin, {
      method: 'POST',
      path: `/api/admin/orders/${accepted.order.id}/escrow/settle`,
      token: adminToken,
    });
    assert.equal(settle.status, 409);
  });

  it('does not double-spend when refund and payout race', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`escrow-race-${Date.now()}`, { totalCost: 10_000_000 });
    trash.push(party);
    const origin = server.origin;
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    await payDeposit(origin, party.tokens.customer, accepted.payment.id);
    await api(origin, {
      method: 'POST',
      path: `/api/orders/${accepted.order.id}/remaining-received`,
      token: party.tokens.customer,
    });
    for (const status of ['STARTED', 'IN_PROGRESS', 'COMPLETED']) {
      await api(origin, {
        method: 'POST',
        path: `/api/orders/${accepted.order.id}/progress`,
        token: party.tokens.contractor,
        body: { status, description: status },
      });
    }
    await api(origin, {
      method: 'POST',
      path: `/api/orders/${accepted.order.id}/complete`,
      token: party.tokens.customer,
    });
    const adminToken = signToken(admin);
    const [payout, refund] = await Promise.all([
      api(origin, {
        method: 'POST',
        path: `/api/admin/orders/${accepted.order.id}/escrow/settle`,
        token: adminToken,
      }),
      api(origin, {
        method: 'POST',
        path: `/api/admin/orders/${accepted.order.id}/escrow/refund`,
        token: adminToken,
        body: { reason: 'race', cancelCase: 'MUTUAL' },
      }),
    ]);
    const statuses = [payout.status, refund.status].sort();
    assert.equal(statuses.includes(200), true);
    assert.equal(statuses.includes(409), true);
    const payment = await Payment.findById(accepted.payment.id);
    const escrow = payment.metadata.escrow;
    assert.equal(
      Number(escrow.releasedAmount || 0) + Number(escrow.refundedAmount || 0) <= Number(escrow.grossAmount || 0),
      true
    );
  });

  it('rolls back a forced payment write so the deposit stays UNPAID', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const party = await createParty(`escrow-tx-${Date.now()}`, { totalCost: 10_000_000 });
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const before = await Payment.findById(accepted.payment.id);
    assert.equal(before.status, 'UNPAID');
    await assert.rejects(async () => {
      await runInTransaction(async (tx) => {
        before.status = 'PAID';
        await before.save(tx);
        throw new Error('forced rollback');
      });
    });
    const after = await Payment.findById(accepted.payment.id);
    assert.equal(after.status, 'UNPAID');
  });

  it('does not create contractor escrow math for a free material snapshot', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const priced = snapshotMaterialFree({ materialSubtotal: 2_000_000, shippingFee: 100_000 });
    assert.equal(priced.depositAmount, 0);
    assert.equal(priced.platformFeeAmount, 0);
    assert.equal(priced.policyVersion, 'MATERIAL_V2_FREE');
    const deposits = await Payment.find({ type: 'DEPOSIT' });
    for (const row of deposits) {
      assert.notEqual(row.metadata?.finance?.policyVersion, 'MATERIAL_V2_FREE');
    }
  });
});
