#!/usr/bin/env node
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');
const { DEPOSIT_TERMS_VERSION } = require('../../src/utils/contractor-finance');

loadTestEnv();
const BASE = 'http://127.0.0.1:5055/api';
const CONTRACTOR_ID = '5bbf65e965e642555b7b9bc3';

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json, text: JSON.stringify(json).slice(0, 300) };
}

async function login(email, password) {
  const pathname = email.includes('admin') ? '/admin/auth/login' : '/auth/login';
  const res = await request(pathname, { method: 'POST', body: { email, password } });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return res.json.data.token;
}

function idOf(value) {
  return value?.id || value?._id;
}

async function main() {
  const url = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: url });
  await pg.connect();
  const who = await pg.query('SELECT current_database() AS db');
  if (who.rows[0].db !== 'BuilMate_test') throw new Error('wrong db');
  const customer = await login('demo.customer@buildmate.test', 'Demo@1234');
  const contractor = await login('demo.contractor@buildmate.test', 'Demo@1234');
  const admin = await login('demo.admin@buildmate.test', 'Admin@1234');

  const created = await request('/repair-requests', {
    method: 'POST',
    token: customer,
    body: {
      contractorId: CONTRACTOR_ID,
      category: 'PLUMBING',
      title: `Prompt15 dispute ${Date.now()}`,
      description: 'Isolated complaint path after deposit.',
      address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
      lat: 10.035,
      lng: 105.78,
      locationConfirmed: true,
      locationSource: 'MANUAL_PIN',
    },
  });
  const requestId = idOf(created.json?.data);
  await request(`/repair-requests/${requestId}/accept`, { method: 'PATCH', token: contractor });
  const quote = await request('/quotations', {
    method: 'POST',
    token: contractor,
    body: {
      requestId,
      estimatedDays: 2,
      items: [{ type: 'LABOR', name: 'Dispute labor', quantity: 1, unit: 'job', price: 10000000 }],
    },
  });
  const quotationId = idOf(quote.json?.data);
  const accepted = await request(`/quotations/${quotationId}/accept`, { method: 'PATCH', token: customer });
  const orderId = idOf(accepted.json?.data?.order);
  const paymentId = idOf(accepted.json?.data?.payment);
  await request(`/payments/${paymentId}/checkout`, {
    method: 'POST',
    token: customer,
    body: { method: 'MOCK', termsAccepted: true, termsVersion: DEPOSIT_TERMS_VERSION },
  });
  await request(`/payments/${paymentId}/mock-success`, { method: 'POST', token: customer });

  const complaint = await request('/complaints', {
    method: 'POST',
    token: customer,
    body: {
      orderId,
      againstUser: CONTRACTOR_ID,
      reason: 'QUALITY',
      description: 'Isolated E2E complaint after deposit was held.',
    },
  });
  const complaintId = idOf(complaint.json?.data);
  const escrow = await pg.query(
    `SELECT e.status FROM service_order_escrows e
     JOIN service_orders so ON so.id = e.service_order_id
     WHERE so.legacy_mongo_id = $1`,
    [String(orderId)]
  );
  const settleOpen = await request(`/orders/${orderId}/settle-escrow`, { method: 'POST', token: admin });
  const processing = await request(`/admin/complaints/${complaintId}`, {
    method: 'PATCH',
    token: admin,
    body: { status: 'PROCESSING', adminNote: 'Reviewing isolated dispute.' },
  });
  const resolved = await request(`/admin/complaints/${complaintId}`, {
    method: 'PATCH',
    token: admin,
    body: { status: 'RESOLVED', adminNote: 'Resolved after isolated review of workmanship.' },
  });
  console.log(
    JSON.stringify(
      {
        database: who.rows[0].db,
        complaintStatus: complaint.status,
        complaintOk: complaint.ok,
        complaintId,
        escrow: escrow.rows[0]?.status,
        settleWhileOpen: settleOpen.status,
        processing: processing.status,
        resolved: resolved.status,
        resolvedBody: resolved.json?.data?.status,
      },
      null,
      2
    )
  );
  await pg.end();
}

main().catch(async (error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
