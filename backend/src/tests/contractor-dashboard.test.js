const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty, createUser, deleteFixtureUsers } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { ROLES } = require('../models/user.model');
const { signToken } = require('../services/authService');
const dashboardService = require('../services/contractorDashboard.service');

describe('Phase 3 contractor dashboard-stats', { timeout: 90000 }, () => {
  let dbReady = false;
  let server;
  let party;
  let otherContractor;

  before(async () => {
    dbReady = testDatabaseReady();
    if (!dbReady) return;
    server = await startTestServer();
    party = await createParty(`dash-${Date.now()}`);
    otherContractor = await createUser({
      name: 'Other Dash Co',
      email: `dash.other.${Date.now()}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
  });

  after(async () => {
    if (server) await server.close();
    await cleanupParty(party);
    if (otherContractor) await deleteFixtureUsers([otherContractor._id]);
  });

  it('returns scoped empty-safe stats and never leaks another contractor', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const empty = await dashboardService.getDashboardStats(otherContractor._id);
    assert.equal(empty.pendingRequests, 0);
    assert.equal(empty.openOrders, 0);
    assert.equal(empty.inProgressOrders, 0);
    assert.equal(empty.monthNetRevenue, 0);
    assert.equal(empty.avgRating, null);
    assert.equal(empty.revenueByMonth.length, 6);
    assert.equal(empty.ordersByMonth.length, 6);
    assert.deepEqual(
      empty.revenueByMonth.every((row) => row.net === 0 && row.gross === 0),
      true
    );
    assert.equal(empty.recentRequests.length, 0);
    assert.equal(empty.needsAssign.length, 0);

    const { customerAction } = require('../services/quotationService');
    await customerAction(party.quotation._id, party.customer._id, 'accept');

    const scoped = await dashboardService.getDashboardStats(party.contractor._id);
    assert.ok(scoped.openOrders >= 1);
    assert.ok(scoped.needsAssign.length >= 1);
    assert.ok(scoped.needsAssign.length <= 5);
    assert.ok(scoped.recentRequests.length <= 5);
    assert.equal(
      scoped.needsAssign.every((row) => Boolean(row.id && row.orderCode)),
      true
    );

    const otherStats = await dashboardService.getDashboardStats(otherContractor._id);
    assert.equal(otherStats.openOrders, 0);
    assert.equal(otherStats.needsAssign.length, 0);

    const origin = server.origin;
    const res = await api(origin, {
      path: '/api/contractor/dashboard-stats',
      token: party.tokens.contractor,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.ok(Array.isArray(res.json.data.revenueByMonth));
    assert.ok(res.json.data.openOrders >= 1);

    const denied = await api(origin, {
      path: '/api/contractor/dashboard-stats',
      token: party.tokens.customer,
    });
    assert.equal(denied.status, 403);

    const otherToken = signToken(otherContractor);
    const otherHttp = await api(origin, {
      path: '/api/contractor/dashboard-stats',
      token: otherToken,
    });
    assert.equal(otherHttp.status, 200);
    assert.equal(otherHttp.json.data.openOrders, 0);
  });
});
