const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { ensureMongo, mongoSkip } = require('./helpers/mongo');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty } = require('./helpers/party');
const { User, ROLES, USER_STATUS } = require('../models/User');
const { signToken } = require('../services/authService');

describe('Sprint 5.3 RBAC audit', { timeout: 90000 }, () => {
  let dbReady = false;
  let server;
  let party;
  let orderId;
  let admin;

  before(async () => {
    dbReady = await ensureMongo();
    if (!dbReady) return;
    server = await startTestServer();
    party = await createParty(`rbac-${Date.now()}`);
    const { customerAction } = require('../services/quotationService');
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    orderId = accepted.order.id;
    admin = await User.create({
      name: 'E2E Admin',
      email: `e2e.admin.${Date.now()}@buildmate.test`,
      password: 'Admin@1234',
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
    });
  });

  after(async () => {
    if (server) await server.close();
    await cleanupParty(party);
    if (admin) await User.deleteOne({ _id: admin._id });
    const { stopMongo } = require('./helpers/mongo');
    await stopMongo();
  });

  it('enforces customer / contractor / admin permissions over HTTP', async (t) => {
    if (!dbReady) {
      t.skip(mongoSkip());
      return;
    }

    const origin = server.origin;
    const { customer, contractor, stranger } = party.tokens;
    const adminToken = signToken(admin);

    const ownList = await api(origin, { path: '/api/orders/customer', token: customer });
    assert.equal(ownList.status, 200);
    assert.equal(ownList.json.success, true);

    const contractorAsCustomer = await api(origin, { path: '/api/orders/customer', token: contractor });
    assert.equal(contractorAsCustomer.status, 403);

    const strangerDetail = await api(origin, { path: `/api/orders/${orderId}`, token: stranger });
    assert.equal(strangerDetail.status, 403);

    const customerProgress = await api(origin, {
      method: 'POST',
      path: `/api/orders/${orderId}/progress`,
      token: customer,
      body: { status: 'STARTED', description: 'Should not work' },
    });
    assert.equal(customerProgress.status, 403);

    const contractorList = await api(origin, { path: '/api/orders/contractor', token: contractor });
    assert.equal(contractorList.status, 200);

    const contractorProgress = await api(origin, {
      method: 'POST',
      path: `/api/orders/${orderId}/progress`,
      token: contractor,
      body: { status: 'STARTED', description: 'Contractor started the job' },
    });
    assert.equal(contractorProgress.status, 201);

    const otherContractor = await User.create({
      name: 'Other Co',
      email: `e2e.otherco.${Date.now()}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
      status: USER_STATUS.ACTIVE,
    });
    const otherToken = signToken(otherContractor);
    const otherSees = await api(origin, { path: `/api/orders/${orderId}`, token: otherToken });
    assert.equal(otherSees.status, 403);

    const customerAdmin = await api(origin, { path: '/api/admin/audit-logs', token: customer });
    assert.equal(customerAdmin.status, 403);

    const adminAudit = await api(origin, { path: '/api/admin/audit-logs', token: adminToken });
    assert.equal(adminAudit.status, 200);
    assert.equal(adminAudit.json.success, true);

    const adminVerify = await api(origin, { path: '/api/admin/verifications', token: adminToken });
    assert.equal(adminVerify.status, 200);

    const storeOwner = await User.create({
      name: 'E2E Store',
      email: `e2e.store.${Date.now()}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.MATERIAL_STORE_OWNER,
      status: USER_STATUS.ACTIVE,
    });
    const customers = await api(origin, { path: '/api/admin/customers', token: adminToken });
    assert.equal(customers.status, 200);
    const customerIds = customers.json.data.map((row) => String(row.id));
    assert.equal(customerIds.includes(String(party.customer._id)), true);
    assert.equal(customerIds.includes(String(party.contractor._id)), false);
    assert.equal(customerIds.includes(String(storeOwner._id)), false);
    assert.equal(customerIds.includes(String(admin._id)), false);
    assert.equal(customers.json.data.every((row) => row.role === 'CUSTOMER'), true);

    const customerDetail = await api(origin, {
      path: `/api/admin/customers/${party.customer._id}`,
      token: adminToken,
    });
    assert.equal(customerDetail.status, 200);
    assert.equal(customerDetail.json.data.user.role, 'CUSTOMER');
    assert.equal(customerDetail.json.data.user.businessName, undefined);

    const contractorDetail = await api(origin, {
      path: `/api/admin/customers/${party.contractor._id}`,
      token: adminToken,
    });
    assert.equal(contractorDetail.status, 404);

    const storeDetail = await api(origin, {
      path: `/api/admin/customers/${storeOwner._id}`,
      token: adminToken,
    });
    assert.equal(storeDetail.status, 404);

    await User.deleteOne({ _id: storeOwner._id });
    await User.deleteOne({ _id: otherContractor._id });
  });
});
