const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

const BASE_API = 'http://127.0.0.1:5055/api';

async function request(path, options = {}) {
  const url = `${BASE_API}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) {}
  return { status: res.status, ok: res.ok, json, text };
}

async function login(email, password) {
  const path = email.includes('admin') ? '/admin/auth/login' : '/auth/login';
  const res = await request(path, {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.text}`);
  return res.json.data.token;
}

// Helper to create an order up to quotation accepted
async function createContractorOrder(customerToken, contractorToken, title) {
  // 1. Customer creates repair request
  const reqRes = await request('/repair-requests', {
    method: 'POST',
    token: customerToken,
    body: {
      contractorId: '5bbf65e965e642555b7b9bc3',
      category: 'PLUMBING',
      title: title || `Plumbing job ${Date.now()}`,
      description: 'Pipeline leakage in the bathroom, urgently need repair.',
      address: '123 Ninh Kieu, Can Tho',
      lat: 10.035,
      lng: 105.78,
      locationConfirmed: true,
    },
  });
  if (!reqRes.ok) throw new Error(`Failed to create repair request: ${reqRes.text}`);
  const repairRequest = reqRes.json.data;

  // 2. Contractor sends quotation 10.000.000 VND
  const quoteRes = await request('/quotations', {
    method: 'POST',
    token: contractorToken,
    body: {
      requestId: repairRequest.id || repairRequest._id,
      totalCost: 10000000,
      description: 'Full inspection, pipe replacement, pressure testing.',
      items: [
        { type: 'LABOR', name: 'Plumber labor', price: 6000000, quantity: 1, unit: 'job' },
        { type: 'MATERIAL', name: 'Pipes & fittings', price: 4000000, quantity: 1, unit: 'package' },
      ],
      termsAccepted: true,
    },
  });
  if (!quoteRes.ok) throw new Error(`Failed to send quotation: ${quoteRes.text}`);
  const quotation = quoteRes.json.data;

  // 3. Customer accepts quotation
  const acceptRes = await request(`/quotations/${quotation.id || quotation._id}/accept`, {
    method: 'PATCH',
    token: customerToken,
  });
  if (!acceptRes.ok) throw new Error(`Failed to accept quotation: ${acceptRes.text}`);
  const acceptedData = acceptRes.json.data;

  const orderId = acceptedData.order?.id || acceptedData.order?._id;
  const paymentId = acceptedData.payment?.id || acceptedData.payment?._id;

  return { repairRequest, quotation, order: acceptedData.order, payment: acceptedData.payment, orderId, paymentId };
}

// Helper to pay deposit 15% (1.500.000 VND)
async function payDeposit(customerToken, paymentId) {
  const checkoutRes = await request(`/payments/${paymentId}/checkout`, {
    method: 'POST',
    token: customerToken,
    body: {
      method: 'MOCK',
      termsAccepted: true,
      termsVersion: 'CONTRACTOR_DEPOSIT_TERMS_V2_DRAFT',
    },
  });
  if (!checkoutRes.ok) throw new Error(`Payment checkout failed: ${checkoutRes.text}`);

  const mockRes = await request(`/payments/${paymentId}/mock-success`, {
    method: 'POST',
    token: customerToken,
  });
  if (!mockRes.ok) throw new Error(`Payment mock success failed: ${mockRes.text}`);
  return mockRes.json.data;
}

async function run() {
  const pgUrl = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: pgUrl });
  await pg.connect();

  const results = {};

  try {
    console.log('=== LOGGING IN ACTORS ===');
    const customerToken = await login('demo.customer@buildmate.test', 'Demo@1234');
    const contractorToken = await login('demo.contractor@buildmate.test', 'Demo@1234');
    const adminToken = await login('demo.admin@buildmate.test', 'Admin@1234');
    console.log('✓ Actors logged in successfully\n');

    // ==========================================
    // TC-C01: Customer cancels before deposit
    // ==========================================
    console.log('=== TC-C01: CUSTOMER CANCELS BEFORE DEPOSIT ===');
    const c01 = await createContractorOrder(customerToken, contractorToken, 'TC-C01 Cancel Before Deposit');
    console.log(`Order created: ${c01.orderId}, status: ${c01.order.status}`);

    const c01Cancel = await request(`/orders/${c01.orderId}/cancel`, {
      method: 'POST',
      token: customerToken,
      body: { reason: 'Customer changed mind before deposit' },
    });
    console.log(`Cancel response status: ${c01Cancel.status}`);

    // Verify in DB
    const c01OrderDb = await pg.query('SELECT status, cancel_reason, cancelled_by FROM service_orders WHERE legacy_mongo_id = $1', [c01.orderId]);
    const c01RefundsDb = await pg.query('SELECT count(*) FROM escrow_refunds WHERE escrow_id = (SELECT id FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1))', [c01.orderId]);
    const c01PayoutsDb = await pg.query('SELECT count(*) FROM contractor_payouts WHERE escrow_id = (SELECT id FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1))', [c01.orderId]);
    const c01CommissionsDb = await pg.query('SELECT count(*) FROM commissions WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1)', [c01.orderId]);

    // Check contractor cannot start
    const c01Start = await request(`/orders/${c01.orderId}/progress`, {
      method: 'POST',
      token: contractorToken,
      body: { status: 'STARTED', description: 'Trying to start cancelled job' },
    });
    console.log(`Contractor start attempt status: ${c01Start.status}`);

    results['TC-C01'] = {
      orderStatus: c01OrderDb.rows[0]?.status,
      cancelReason: c01OrderDb.rows[0]?.cancel_reason,
      refundCount: Number(c01RefundsDb.rows[0]?.count || 0),
      payoutCount: Number(c01PayoutsDb.rows[0]?.count || 0),
      commissionCount: Number(c01CommissionsDb.rows[0]?.count || 0),
      contractorStartBlocked: c01Start.status === 409 || c01Start.status === 400,
      passed: c01Cancel.ok &&
              c01OrderDb.rows[0]?.status === 'CANCELLED' &&
              Number(c01RefundsDb.rows[0]?.count || 0) === 0 &&
              Number(c01PayoutsDb.rows[0]?.count || 0) === 0 &&
              Number(c01CommissionsDb.rows[0]?.count || 0) === 0 &&
              (c01Start.status === 409 || c01Start.status === 400),
    };
    console.log('TC-C01 Result:', results['TC-C01'], '\n');

    // ==========================================
    // TC-C02: Customer cancels after deposit
    // ==========================================
    console.log('=== TC-C02: CUSTOMER CANCELS AFTER DEPOSIT ===');
    const c02 = await createContractorOrder(customerToken, contractorToken, 'TC-C02 Cancel After Deposit');
    await payDeposit(customerToken, c02.paymentId);
    console.log(`Order ${c02.orderId} deposit paid 1.500.000 VND`);

    const c02Cancel = await request(`/orders/${c02.orderId}/cancel`, {
      method: 'POST',
      token: customerToken,
      body: { reason: 'Customer cancels after deposit' },
    });
    console.log(`Cancel response status: ${c02Cancel.status}`);

    const c02OrderDb = await pg.query('SELECT status, cancel_reason FROM service_orders WHERE legacy_mongo_id = $1', [c02.orderId]);
    const c02EscrowDb = await pg.query('SELECT status, cancel_case FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1)', [c02.orderId]);
    const c02RefundsDb = await pg.query('SELECT count(*) FROM escrow_refunds WHERE escrow_id = (SELECT id FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1))', [c02.orderId]);
    const c02PayoutsDb = await pg.query('SELECT count(*) FROM contractor_payouts WHERE escrow_id = (SELECT id FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1))', [c02.orderId]);
    const c02CommissionsDb = await pg.query('SELECT count(*) FROM commissions WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1) AND status = $2', [c02.orderId, 'POSTED']);

    // Admin can view order
    const c02AdminView = await request(`/orders/${c02.orderId}`, { token: adminToken });

    results['TC-C02'] = {
      orderStatus: c02OrderDb.rows[0]?.status,
      escrowStatus: c02EscrowDb.rows[0]?.status,
      cancelCase: c02EscrowDb.rows[0]?.cancel_case,
      autoRefunded: Number(c02RefundsDb.rows[0]?.count || 0) > 0,
      autoPaidOut: Number(c02PayoutsDb.rows[0]?.count || 0) > 0,
      platformFeePosted: Number(c02CommissionsDb.rows[0]?.count || 0) > 0,
      adminCanView: c02AdminView.ok && c02AdminView.json?.data?.orderCode !== undefined,
      passed: c02Cancel.ok &&
              c02OrderDb.rows[0]?.status === 'CANCELLED' &&
              c02EscrowDb.rows[0]?.status === 'FROZEN' &&
              c02EscrowDb.rows[0]?.cancel_case === 'CUSTOMER_AFTER_DEPOSIT' &&
              Number(c02RefundsDb.rows[0]?.count || 0) === 0 &&
              Number(c02PayoutsDb.rows[0]?.count || 0) === 0 &&
              Number(c02CommissionsDb.rows[0]?.count || 0) === 0,
    };
    console.log('TC-C02 Result:', results['TC-C02'], '\n');

    // ==========================================
    // TC-C03: Contractor cancels after deposit
    // ==========================================
    console.log('=== TC-C03: CONTRACTOR CANCELS AFTER DEPOSIT ===');
    const c03 = await createContractorOrder(customerToken, contractorToken, 'TC-C03 Contractor Cancel After Deposit');
    await payDeposit(customerToken, c03.paymentId);
    console.log(`Order ${c03.orderId} deposit paid 1.500.000 VND`);

    const c03Cancel = await request(`/orders/${c03.orderId}/cancel`, {
      method: 'POST',
      token: contractorToken,
      body: { reason: 'Contractor crew unavailable' },
    });
    console.log(`Contractor cancel response status: ${c03Cancel.status}`);

    const c03OrderDb = await pg.query('SELECT status, cancel_reason FROM service_orders WHERE legacy_mongo_id = $1', [c03.orderId]);
    const c03PayDb = await pg.query('SELECT status FROM payments WHERE legacy_mongo_id = $1', [c03.paymentId]);
    const c03EscrowDb = await pg.query('SELECT status, refunded_amount FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1)', [c03.orderId]);
    const c03RefundsDb = await pg.query('SELECT amount, reason, cancel_case FROM escrow_refunds WHERE escrow_id = (SELECT id FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1))', [c03.orderId]);
    const c03PayoutsDb = await pg.query('SELECT count(*) FROM contractor_payouts WHERE escrow_id = (SELECT id FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1))', [c03.orderId]);

    // Test second refund refusal (idempotency)
    const c03DoubleRefund = await request(`/admin/orders/${c03.orderId}/escrow/refund`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Duplicate refund attempt' },
    });
    console.log(`Double refund attempt status: ${c03DoubleRefund.status}`);

    results['TC-C03'] = {
      orderStatus: c03OrderDb.rows[0]?.status,
      paymentStatus: c03PayDb.rows[0]?.status,
      escrowStatus: c03EscrowDb.rows[0]?.status,
      refundAmount: Number(c03RefundsDb.rows[0]?.amount || 0),
      contractorPayoutCount: Number(c03PayoutsDb.rows[0]?.count || 0),
      doubleRefundRefused: c03DoubleRefund.status === 409,
      passed: c03Cancel.ok &&
              c03OrderDb.rows[0]?.status === 'CANCELLED' &&
              c03PayDb.rows[0]?.status === 'REFUNDED' &&
              c03EscrowDb.rows[0]?.status === 'REFUNDED' &&
              Number(c03RefundsDb.rows[0]?.amount || 0) === 1500000 &&
              Number(c03PayoutsDb.rows[0]?.count || 0) === 0 &&
              c03DoubleRefund.status === 409,
    };
    console.log('TC-C03 Result:', results['TC-C03'], '\n');

    // ==========================================
    // TC-C04: Dispute freezes Escrow
    // ==========================================
    console.log('=== TC-C04: DISPUTE FREEZES ESCROW ===');
    const c04 = await createContractorOrder(customerToken, contractorToken, 'TC-C04 Dispute Freezes Escrow');
    await payDeposit(customerToken, c04.paymentId);
    console.log(`Order ${c04.orderId} deposit paid 1.500.000 VND`);

    // Customer opens complaint
    const complaintRes = await request('/complaints', {
      method: 'POST',
      token: customerToken,
      body: {
        orderId: c04.orderId,
        againstUser: '5bbf65e965e642555b7b9bc3', // Contractor
        reason: 'Contractor dispute over materials quality',
        description: 'Pipes installed are substandard and do not meet agreed quotation specification.',
      },
    });
    console.log(`Complaint creation status: ${complaintRes.status}`);

    const c04EscrowDb = await pg.query('SELECT status FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1)', [c04.orderId]);
    const complaintsDb = await pg.query('SELECT status, reason FROM complaints WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1)', [c04.orderId]);

    // Admin settlement attempt while complaint is open
    const c04Settle = await request(`/admin/orders/${c04.orderId}/escrow/settle`, {
      method: 'POST',
      token: adminToken,
    });
    console.log(`Payout attempt during dispute status: ${c04Settle.status}`);

    // Admin lists complaints
    const adminComplaints = await request('/admin/complaints', { token: adminToken });
    const complaintListed = (adminComplaints.json?.data || []).some(c => c.orderId === c04.orderId || c.reason?.includes('Contractor dispute'));

    results['TC-C04'] = {
      complaintCreated: complaintRes.status === 201,
      complaintStatus: complaintsDb.rows[0]?.status,
      escrowStatus: c04EscrowDb.rows[0]?.status,
      payoutBlockedStatus: c04Settle.status,
      adminComplaintListed: complaintListed,
      passed: complaintRes.status === 201 &&
              complaintsDb.rows[0]?.status === 'OPEN' &&
              c04EscrowDb.rows[0]?.status === 'FROZEN' &&
              c04Settle.status === 409 &&
              complaintListed,
    };
    console.log('TC-C04 Result:', results['TC-C04'], '\n');

    // ==========================================
    // TC-C05: Anti-Double Spend & Race Conditions
    // ==========================================
    console.log('=== TC-C05: ANTI-DOUBLE SPEND & RACE CONDITIONS ===');

    // 1. Two concurrent refund requests
    const race1 = await createContractorOrder(customerToken, contractorToken, 'TC-C05 Concurrent Refunds');
    await payDeposit(customerToken, race1.paymentId);
    console.log(`Order ${race1.orderId} prepared for concurrent refunds`);

    const [ref1, ref2] = await Promise.all([
      request(`/admin/orders/${race1.orderId}/escrow/refund`, {
        method: 'POST',
        token: adminToken,
        body: { reason: 'Race refund 1', cancelCase: 'MUTUAL' },
      }),
      request(`/admin/orders/${race1.orderId}/escrow/refund`, {
        method: 'POST',
        token: adminToken,
        body: { reason: 'Race refund 2', cancelCase: 'MUTUAL' },
      }),
    ]);
    const refStatuses = [ref1.status, ref2.status].sort();
    console.log(`Concurrent refunds statuses: ${refStatuses.join(', ')}`);

    // 2. Concurrent refund and payout on completed order
    const race2 = await createContractorOrder(customerToken, contractorToken, 'TC-C05 Refund vs Payout');
    await payDeposit(customerToken, race2.paymentId);
    // Complete the job
    await request(`/orders/${race2.orderId}/remaining-received`, { method: 'POST', token: customerToken });
    for (const status of ['STARTED', 'IN_PROGRESS', 'COMPLETED']) {
      await request(`/orders/${race2.orderId}/progress`, {
        method: 'POST',
        token: contractorToken,
        body: { status, description: `Job ${status}` },
      });
    }
    await request(`/orders/${race2.orderId}/complete`, { method: 'POST', token: customerToken });
    console.log(`Order ${race2.orderId} completed and ready for settlement`);

    const [settleRes, refundRes] = await Promise.all([
      request(`/admin/orders/${race2.orderId}/escrow/settle`, { method: 'POST', token: adminToken }),
      request(`/admin/orders/${race2.orderId}/escrow/refund`, {
        method: 'POST',
        token: adminToken,
        body: { reason: 'Race refund vs payout', cancelCase: 'MUTUAL' },
      }),
    ]);
    const settleRefundStatuses = [settleRes.status, refundRes.status].sort();
    console.log(`Concurrent settle vs refund statuses: ${settleRefundStatuses.join(', ')}`);

    // Check DB invariants
    const race2EscrowDb = await pg.query('SELECT gross_amount, released_amount, refunded_amount FROM service_order_escrows WHERE service_order_id = (SELECT id FROM service_orders WHERE legacy_mongo_id = $1)', [race2.orderId]);
    const escrowRow = race2EscrowDb.rows[0] || {};
    const totalSpent = Number(escrowRow.released_amount || 0) + Number(escrowRow.refunded_amount || 0);

    results['TC-C05'] = {
      concurrentRefundStatuses: refStatuses,
      concurrentRefundOneWinner: refStatuses[0] === 200 && refStatuses[1] === 409,
      settleVsRefundStatuses: settleRefundStatuses,
      settleVsRefundOneWinner: settleRefundStatuses[0] === 200 && settleRefundStatuses[1] === 409,
      escrowGrossAmount: Number(escrowRow.gross_amount || 0),
      escrowTotalSpent: totalSpent,
      noOverspend: totalSpent <= Number(escrowRow.gross_amount || 0),
      passed: (refStatuses[0] === 200 && refStatuses[1] === 409) &&
              (settleRefundStatuses[0] === 200 && settleRefundStatuses[1] === 409) &&
              totalSpent <= Number(escrowRow.gross_amount || 0),
    };
    console.log('TC-C05 Result:', results['TC-C05'], '\n');

    console.log('=== ALL PHASE 7C RESULTS ===');
    console.log(JSON.stringify(results, null, 2));

  } finally {
    await pg.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
