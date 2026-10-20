const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty, createUser, deleteFixtureUsers, ROLES } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { depositCheckoutBody } = require('./helpers/finance-http');
const { signToken } = require('../services/authService');

describe('Sprint 5.3 RBAC audit', { timeout: 90000 }, () => {
  let dbReady = false;
  let server;
  let party;
  let orderId;
  let paymentId;
  let admin;
  const extraIds = [];

  before(async () => {
    dbReady = testDatabaseReady();
    if (!dbReady) return;
    server = await startTestServer();
    party = await createParty(`rbac-${Date.now()}`);
    const { customerAction } = require('../services/quotationService');
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    orderId = accepted.order.id;
    paymentId = accepted.payment.id;
    admin = await createUser({
      name: 'E2E Admin',
      email: `e2e.admin.${Date.now()}@buildmate.test`,
      password: 'Admin@1234',
      role: ROLES.ADMIN,
    });
  });

  after(async () => {
    if (server) await server.close();
    await cleanupParty(party);
    if (admin) extraIds.push(admin._id);
    if (extraIds.length) await deleteFixtureUsers(extraIds);
  });

  async function progress(token, status = 'STARTED') {
    return api(server.origin, {
      method: 'POST',
      path: `/api/orders/${orderId}/progress`,
      token,
      body: { status, description: `Site ${status}` },
    });
  }

  it('refuses STARTED before deposit and refuses the wrong actors', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
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

    const anonymous = await progress(undefined);
    assert.equal(anonymous.status, 401);

    const customerProgress = await progress(customer);
    assert.equal(customerProgress.status, 403);

    const unpaidStart = await progress(contractor);
    assert.equal(unpaidStart.status, 409);

    const adminStart = await progress(adminToken);
    assert.equal(adminStart.status, 403);

    const storeOwner = await createUser({
      name: 'E2E Store',
      email: `e2e.store.${Date.now()}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.MATERIAL_STORE_OWNER,
    });
    extraIds.push(storeOwner._id);
    const storeStart = await progress(signToken(storeOwner));
    assert.equal(storeStart.status, 403);

    const otherContractor = await createUser({
      name: 'Other Co',
      email: `e2e.otherco.${Date.now()}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    extraIds.push(otherContractor._id);
    const otherToken = signToken(otherContractor);
    const otherSees = await api(origin, { path: `/api/orders/${orderId}`, token: otherToken });
    assert.equal(otherSees.status, 403);
    const otherStart = await progress(otherToken);
    assert.equal(otherStart.status, 403);

    const checkout = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/checkout`,
      token: customer,
      body: depositCheckoutBody(),
    });
    assert.equal(checkout.status, 200, checkout.json?.message);
    const paid = await api(origin, {
      method: 'POST',
      path: `/api/payments/${paymentId}/mock-success`,
      token: customer,
    });
    assert.equal(paid.status, 200, paid.json?.message);
    assert.equal(paid.json.data.escrow.status, 'HELD');

    const contractorList = await api(origin, { path: '/api/orders/contractor', token: contractor });
    assert.equal(contractorList.status, 200);

    const contractorProgress = await progress(contractor);
    assert.equal(contractorProgress.status, 201, contractorProgress.json?.message);

    const stillCustomer = await progress(customer);
    assert.equal(stillCustomer.status, 403);
    const stillOther = await progress(otherToken);
    assert.equal(stillOther.status, 403);
    const stillStore = await progress(signToken(storeOwner));
    assert.equal(stillStore.status, 403);

    const customerAdmin = await api(origin, { path: '/api/admin/audit-logs', token: customer });
    assert.equal(customerAdmin.status, 403);

    const adminAudit = await api(origin, { path: '/api/admin/audit-logs', token: adminToken });
    assert.equal(adminAudit.status, 200);
    assert.equal(adminAudit.json.success, true);

    const adminVerify = await api(origin, { path: '/api/admin/verifications', token: adminToken });
    assert.equal(adminVerify.status, 200);

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
  });
});
