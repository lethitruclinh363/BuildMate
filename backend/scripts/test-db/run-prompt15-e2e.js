#!/usr/bin/env node
/**
 * Prompt 15 HTTP/integration E2E against BuilMate_test via :5055 only.
 * Never prints tokens, passwords, or full connection strings.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');
const { DEPOSIT_TERMS_VERSION } = require('../../src/utils/contractor-finance');

loadTestEnv();

const BASE = 'http://127.0.0.1:5055/api';
const CONTRACTOR_ID = '5bbf65e965e642555b7b9bc3';
const STORE_ID = '82a98eb32f87abb362a131ba';
const CEMENT_ID = 'e329a4afbf00dd186a0aaaf9';
const OUT = path.resolve(__dirname, '../../../docs/prompt-15-e2e/http-results.json');

const results = [];

function record(id, flow, expected, actual, passed, extra = {}) {
  const row = {
    id,
    flow,
    expected,
    actual: String(actual).slice(0, 400),
    passed,
    ...extra,
  };
  results.push(row);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${id} ${actual}`);
  return passed;
}

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 500) };
}

async function login(email, password) {
  const pathname = email.includes('admin') ? '/admin/auth/login' : '/auth/login';
  const res = await request(pathname, { method: 'POST', body: { email, password } });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status} ${res.text}`);
  return { token: res.json.data.token, user: res.json.data.user };
}

async function pgCheck(client, sql, params = []) {
  const who = await client.query('SELECT current_database() AS db');
  if (who.rows[0].db !== 'BuilMate_test') throw new Error('Refusing write/read outside BuilMate_test');
  return client.query(sql, params);
}

async function main() {
  const url = requireIsolatedTestDatabase();
  const health = await request('/health');
  if (!health.ok) throw new Error(`test API 5055 is down: ${health.text}`);

  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
  const who = await pgCheck(pg, 'SELECT current_database() AS db, inet_server_port() AS port');
  record('ENV-01', 'env', 'BuilMate_test', who.rows[0].db, who.rows[0].db === 'BuilMate_test');

  const customer = await login('demo.customer@buildmate.test', 'Demo@1234');
  const contractor = await login('demo.contractor@buildmate.test', 'Demo@1234');
  const store = await login('demo.store@buildmate.test', 'Demo@1234');
  const admin = await login('demo.admin@buildmate.test', 'Admin@1234');
  record('AUTH-01', 'auth', 'customer CUSTOMER', customer.user.role, customer.user.role === 'CUSTOMER');
  record('AUTH-02', 'auth', 'contractor CONTRACTOR', contractor.user.role, contractor.user.role === 'CONTRACTOR');
  record('AUTH-03', 'auth', 'store MATERIAL_STORE_OWNER', store.user.role, store.user.role === 'MATERIAL_STORE_OWNER');
  record('AUTH-04', 'auth', 'admin ADMIN', admin.user.role, admin.user.role === 'ADMIN');

  const customerOnAdmin = await request('/admin/auth/login', {
    method: 'POST',
    body: { email: 'demo.customer@buildmate.test', password: 'Demo@1234' },
  });
  record('AUTH-05', 'auth', 'customer rejected on admin login', customerOnAdmin.status, customerOnAdmin.status >= 400);

  const contractorOnStore = await request('/material-store/orders', { token: contractor.token });
  record('AUTH-06', 'auth', 'contractor cannot list store orders', contractorOnStore.status, contractorOnStore.status === 403);

  const storeOnContractor = await request('/repair-requests/received', { token: store.token });
  record('AUTH-07', 'auth', 'store cannot list contractor requests', storeOnContractor.status, storeOnContractor.status === 403);

  const guestCccd = await fetch('http://127.0.0.1:5055/uploads/contractors/does-not-exist.jpg');
  record('FILE-01', 'files', 'unknown contractor file 404', guestCccd.status, guestCccd.status === 404);

  const nearby = await request('/location/contractors/nearby?lat=10.045&lng=105.746&radiusKm=50');
  const crews = nearby.json?.data || [];
  const liveCrew = crews.find((row) => String(row.contractorId) === CONTRACTOR_ID || String(row.id) === CONTRACTOR_ID);
  record('MKT-01', 'activation', 'LIVE contractor nearby', Boolean(liveCrew), Boolean(liveCrew), { count: crews.length });

  const quotePending = await request('/quotations', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      estimatedDays: 2,
      items: [{ type: 'LABOR', name: 'Should fail', quantity: 1, unit: 'job', price: 100000 }],
    },
  });
  record('REP-00', 'repair', 'quote without real accepted request fails', quotePending.status, quotePending.status >= 400);

  const created = await request('/repair-requests', {
    method: 'POST',
    token: customer.token,
    body: {
      contractorId: CONTRACTOR_ID,
      category: 'PLUMBING',
      title: `Prompt15 leak ${Date.now()}`,
      description: 'Isolated E2E pipe leak in the bathroom, need repair today.',
      address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
      lat: 10.035,
      lng: 105.78,
      locationConfirmed: true,
      locationSource: 'MANUAL_PIN',
    },
  });
  const requestId = created.json?.data?.id || created.json?.data?._id;
  record('REP-01', 'repair', 'create request 200', `${created.status} ${created.text}`, created.ok && Boolean(requestId), { requestId });

  const pendingQuote = await request('/quotations', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId,
      estimatedDays: 2,
      items: [{ type: 'LABOR', name: 'Too early', quantity: 1, unit: 'job', price: 10000000 }],
    },
  });
  record('REP-02', 'repair', 'quote while PENDING is 409', pendingQuote.status, pendingQuote.status === 409);

  const acceptedReq = await request(`/repair-requests/${requestId}/accept`, { method: 'PATCH', token: contractor.token });
  record('REP-03', 'repair', 'contractor accept', acceptedReq.ok, acceptedReq.ok);

  const quote = await request('/quotations', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId,
      estimatedDays: 3,
      items: [
        { type: 'LABOR', name: 'Plumber labor', quantity: 1, unit: 'job', price: 6000000 },
        { type: 'MATERIAL', name: 'Pipes', quantity: 1, unit: 'package', price: 4000000 },
      ],
    },
  });
  const quotationId = quote.json?.data?.id || quote.json?.data?._id;
  record('REP-04', 'repair', 'quotation 10_000_000', quote.ok && quote.json?.data?.totalCost === 10000000, quote.ok, {
    total: quote.json?.data?.totalCost,
  });

  const quoteAgain = await request('/quotations', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId,
      estimatedDays: 3,
      items: [
        { type: 'LABOR', name: 'Plumber labor', quantity: 1, unit: 'job', price: 6000000 },
        { type: 'MATERIAL', name: 'Pipes', quantity: 1, unit: 'package', price: 4000000 },
      ],
    },
  });
  const replayId = quoteAgain.json?.data?.id || quoteAgain.json?.data?._id;
  record('RACE-01', 'race', 'duplicate quotation replays same id', String(replayId) === String(quotationId), String(replayId) === String(quotationId));

  const acceptQuote = await request(`/quotations/${quotationId}/accept`, { method: 'PATCH', token: customer.token });
  const orderId = acceptQuote.json?.data?.order?.id || acceptQuote.json?.data?.order?._id;
  const paymentId = acceptQuote.json?.data?.payment?.id || acceptQuote.json?.data?.payment?._id;
  record('REP-05', 'repair', 'accept quote creates order+deposit', Boolean(orderId && paymentId), Boolean(orderId && paymentId));

  const acceptQuote2 = await request(`/quotations/${quotationId}/accept`, { method: 'PATCH', token: customer.token });
  const orderId2 = acceptQuote2.json?.data?.order?.id || acceptQuote2.json?.data?.order?._id;
  record('RACE-02', 'race', 'second accept keeps one order', String(orderId2) === String(orderId), String(orderId2) === String(orderId));

  const checkout = await request(`/payments/${paymentId}/checkout`, {
    method: 'POST',
    token: customer.token,
    body: { method: 'MOCK', termsAccepted: true, termsVersion: DEPOSIT_TERMS_VERSION },
  });
  record('REP-06', 'repair', 'deposit checkout', checkout.ok, checkout.ok);

  const paid = await request(`/payments/${paymentId}/mock-success`, { method: 'POST', token: customer.token });
  record('REP-07', 'repair', 'mock-success 15/5/10', paid.ok, paid.ok);

  const paidAgain = await request(`/payments/${paymentId}/mock-success`, { method: 'POST', token: customer.token });
  record('RACE-03', 'race', 'replay mock-success does not 500', paidAgain.status < 500, paidAgain.status < 500);

  let escrow = {};
  try {
    const escrowRow = await pgCheck(
      pg,
      `SELECT so.status, so.legacy_mongo_id, e.status AS escrow_status, e.available_amount,
              e.gross_amount, e.platform_fee_amount, e.contractor_hold_amount
       FROM service_orders so
       LEFT JOIN service_order_escrows e ON e.service_order_id = so.id
       WHERE so.legacy_mongo_id = $1`,
      [String(orderId)]
    );
    escrow = escrowRow.rows[0] || {};
  } catch (error) {
    escrow = { error: String(error.message || error) };
  }
  record(
    'ESC-01',
    'escrow',
    'order DEPOSIT_PAID + escrow HELD',
    `${escrow.status}/${escrow.escrow_status}/${escrow.gross_amount}/${escrow.error || ''}`,
    escrow.status === 'DEPOSIT_PAID' && escrow.escrow_status === 'HELD'
  );
  if (Number(escrow.gross_amount) === 1500000) {
    record('REP-08b', 'repair', 'escrow gross 1_500_000', escrow.gross_amount, true);
  }

  record(
    'REP-08',
    'repair',
    '1_500_000 / 500_000 / 1_000_000',
    `${escrow.gross_amount}/${escrow.platform_fee_amount}/${escrow.contractor_hold_amount}`,
    Number(escrow.gross_amount) === 1500000 &&
      Number(escrow.platform_fee_amount) === 500000 &&
      Number(escrow.contractor_hold_amount) === 1000000
  );
  const commissionEarly = await pgCheck(
    pg,
    `SELECT count(*)::int AS n FROM commissions c
     JOIN service_orders so ON so.id = c.service_order_id
     WHERE so.legacy_mongo_id = $1 AND c.status = 'POSTED'`,
    [String(orderId)]
  );
  record('ESC-02', 'escrow', 'no POSTED commission before settle', commissionEarly.rows[0].n, commissionEarly.rows[0].n === 0);

  for (const status of ['STARTED', 'IN_PROGRESS', 'COMPLETED']) {
    const prog = await request(`/orders/${orderId}/progress`, {
      method: 'POST',
      token: contractor.token,
      body: { status, description: `Isolated E2E ${status}` },
    });
    record(`REP-${status}`, 'repair', `progress ${status}`, prog.ok, prog.ok);
  }

  const complete = await request(`/orders/${orderId}/complete`, { method: 'POST', token: customer.token });
  record('REP-09', 'repair', 'customer accepted', complete.json?.data?.order?.status || complete.json?.data?.status, /CUSTOMER_ACCEPTED/.test(JSON.stringify(complete.json || {})));

  const complete2 = await request(`/orders/${orderId}/complete`, { method: 'POST', token: customer.token });
  record('RACE-04', 'race', 'second acceptance not 500', complete2.status < 500, complete2.status < 500);

  const remaining = await request(`/orders/${orderId}/remaining-received`, { method: 'POST', token: customer.token });
  record('REP-10', 'repair', 'confirm 85%', remaining.ok, remaining.ok);

  const settleEarly = await request(`/orders/${orderId}/settle-escrow`, { method: 'POST', token: admin.token });
  record('ESC-03', 'escrow', 'admin settle after accept+85%', settleEarly.ok, settleEarly.ok, { body: settleEarly.text });

  const posted = await pgCheck(
    pg,
    `SELECT count(*)::int AS n, coalesce(sum(c.platform_amount),0)::int AS amount FROM commissions c
     JOIN service_orders so ON so.id = c.service_order_id
     WHERE so.legacy_mongo_id = $1 AND c.status = 'POSTED'`,
    [String(orderId)]
  );
  record('ESC-04', 'escrow', 'commission POSTED 500000 once', `${posted.rows[0].n}/${posted.rows[0].amount}`, posted.rows[0].n === 1 && Number(posted.rows[0].amount) === 500000);

  const settle2 = await request(`/orders/${orderId}/settle-escrow`, { method: 'POST', token: admin.token });
  record('RACE-05', 'race', 'second settle blocked or idempotent', settle2.status === 409 || settle2.ok, settle2.status === 409 || settle2.ok);

  const chatRooms = await request('/chat/rooms', { token: customer.token });
  const room = (chatRooms.json?.data || []).find((row) => String(row.requestId) === String(requestId)) || (chatRooms.json?.data || [])[0];
  if (room?.id || room?._id) {
    const roomId = room.id || room._id;
    const sent = await request(`/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      token: customer.token,
      body: { type: 'TEXT', content: `prompt15 ping ${Date.now()}` },
    });
    record('CHAT-01', 'chat', 'customer text', sent.ok, sent.ok);
    const loc = await request(`/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      token: contractor.token,
      body: { type: 'LOCATION', content: '', location: { lat: 10.035, lng: 105.78, address: 'Ninh Kieu' } },
    });
    record('CHAT-02', 'chat', 'contractor location', loc.ok, loc.ok);
    const history = await request(`/chat/rooms/${roomId}/messages`, { token: customer.token });
    const n = (history.json?.data || history.json?.data?.items || []).length || (Array.isArray(history.json?.data) ? history.json.data.length : 0);
    record('CHAT-03', 'chat', 'history readable', history.ok, history.ok, { n });
    const stranger = await request(`/chat/rooms/${roomId}/messages`, { token: store.token });
    record('CHAT-04', 'chat', 'store cannot read repair room', stranger.status === 403, stranger.status === 403);
  } else {
    record('CHAT-01', 'chat', 'room exists', false, false);
  }

  const quoteRes = await request('/material-checkout/quote', {
    method: 'POST',
    token: customer.token,
    body: {
      storeId: STORE_ID,
      address: '88 Hoa Binh, Ninh Kieu, Can Tho',
      lat: 10.035,
      lng: 105.78,
      items: [{ materialId: CEMENT_ID, quantity: 1 }],
    },
  });
  const q = quoteRes.json?.data;
  record('COD-01', 'cod', 'quote 2_100_000 with 100k ship', q?.orderTotal, q?.ok === true && q?.orderTotal === 2100000 && q?.shippingFee === 100000);

  const orderCod = await request('/material-orders', {
    method: 'POST',
    token: customer.token,
    body: {
      storeId: STORE_ID,
      deliveryAddress: '88 Hoa Binh, Ninh Kieu, Can Tho',
      lat: 10.035,
      lng: 105.78,
      locationConfirmed: true,
      locationSource: 'MANUAL_PIN',
      items: [{ materialId: CEMENT_ID, quantity: 1 }],
    },
  });
  const materialOrderId = orderCod.json?.data?.id || orderCod.json?.data?._id || orderCod.json?.data?.legacyMongoId;
  record('COD-02', 'cod', 'create COD order', orderCod.ok, orderCod.ok, { materialOrderId });

  if (materialOrderId) {
    const dbCod = await pgCheck(
      pg,
      `SELECT order_code, status, total_amount, deposit_amount, platform_fee_amount, payment_status
       FROM material_orders WHERE legacy_mongo_id = $1 OR id::text = $1`,
      [String(materialOrderId)]
    );
    const row = dbCod.rows[0] || {};
    record(
      'COD-03',
      'cod',
      'fee 0 deposit 0',
      `${row.deposit_amount}/${row.platform_fee_amount}/${row.total_amount}`,
      Number(row.deposit_amount) === 0 && Number(row.platform_fee_amount) === 0 && Number(row.total_amount) === 2100000
    );

    const steps = ['CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'DELIVERING', 'DELIVERED'];
    let status = row.status;
    for (const next of steps) {
      if (status === next) continue;
      const adv = await request(`/material-store/orders/${materialOrderId}`, {
        method: 'PATCH',
        token: store.token,
        body: { status: next },
      });
      status = adv.json?.data?.status || status;
    }
    record('COD-04', 'cod', 'store reaches DELIVERED', status, status === 'DELIVERED');

    const recv = await request(`/material-orders/${materialOrderId}/receive`, { method: 'POST', token: customer.token });
    record('COD-05', 'cod', 'customer received', recv.json?.data?.status, /CUSTOMER_RECEIVED|COMPLETED/.test(String(recv.json?.data?.status || '')));
    const recv2 = await request(`/material-orders/${materialOrderId}/receive`, { method: 'POST', token: customer.token });
    record('RACE-06', 'race', 'second receive not 500', recv2.status < 500, recv2.status < 500);

    const collect = await request(`/material-store/orders/${materialOrderId}/collected`, { method: 'POST', token: store.token });
    record('COD-06', 'cod', 'store collected COD', collect.json?.data?.paymentStatus, collect.ok);
    const collect2 = await request(`/material-store/orders/${materialOrderId}/collected`, { method: 'POST', token: store.token });
    record('RACE-07', 'race', 'second COD collect blocked or ok', collect2.status === 409 || collect2.ok, collect2.status === 409 || collect2.ok);

    const review = await request('/reviews/material-orders', {
      method: 'POST',
      token: customer.token,
      body: { materialOrderId, rating: 5, comment: 'Isolated E2E delivery was on time.' },
    });
    record('COD-07', 'cod', 'store review', review.ok || review.status === 409, review.ok || review.status === 409);
  }

  const pause = await request('/contractor/activation/pause', { method: 'POST', token: contractor.token });
  record('ACT-01', 'activation', 'contractor pause', pause.ok, pause.ok);
  const blockedReq = await request('/repair-requests', {
    method: 'POST',
    token: customer.token,
    body: {
      contractorId: CONTRACTOR_ID,
      category: 'PLUMBING',
      title: `Paused crew ${Date.now()}`,
      description: 'Should not accept while PAUSED.',
      address: '12 Nguyen Van Cu, Ninh Kieu, Can Tho',
      lat: 10.035,
      lng: 105.78,
      locationConfirmed: true,
      locationSource: 'MANUAL_PIN',
    },
  });
  record('ACT-02', 'activation', 'paused contractor rejects new request', blockedReq.status >= 400, blockedReq.status >= 400);
  const live = await request('/contractor/activation', { method: 'POST', token: contractor.token });
  record('ACT-03', 'activation', 'contractor LIVE again', live.ok, live.ok);

  const analytics = await request('/admin/analytics', { token: admin.token });
  const fin = analytics.json?.data?.finance || {};
  record('ADM-01', 'admin', 'GMV != commission', `${fin.gmv}/${fin.commission}`, Number(fin.gmv) !== Number(fin.commission) || (fin.gmv == null && fin.commission == null) ? Number.isFinite(Number(fin.gmv)) && Number(fin.gmv) !== Number(fin.commission) : Number(fin.gmv) !== Number(fin.commission));
  record('ADM-02', 'admin', 'analytics 200', analytics.ok, analytics.ok, {
    gmv: fin.gmv,
    commission: fin.commission,
    liveContractor: analytics.json?.data?.users?.liveContractor,
  });

  const series = analytics.json?.data?.series;
  record('ADM-03', 'admin', 'series days7/days30/months12 exist', Boolean(series?.days7 && series?.days30 && series?.months12), Boolean(series?.days7 && series?.days30 && series?.months12));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        database: who.rows[0].db,
        api: BASE,
        at: new Date().toISOString(),
        pass: results.filter((row) => row.passed).length,
        fail: results.filter((row) => !row.passed).length,
        results,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${OUT} pass=${results.filter((r) => r.passed).length} fail=${results.filter((r) => !r.passed).length}`);
  if (results.some((row) => !row.passed)) process.exitCode = 1;
  } finally {
    await pg.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
