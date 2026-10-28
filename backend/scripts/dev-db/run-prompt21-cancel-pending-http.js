#!/usr/bin/env node
/**
 * HTTP + PostgreSQL checks for Customer cancel PENDING repair request
 * on DEV (:5065 / BuilMate_dev). Refuses demo API ports. Does not print tokens.
 */
const { Client } = require('pg');
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

const base = String(process.env.CHAT_API_URL || process.env.MRL_API_URL || 'http://127.0.0.1:5065').replace(/\/$/, '');
const password = process.env.CHAT_PASSWORD || process.env.MRL_PASSWORD;

if (!password) {
  console.error('Set CHAT_PASSWORD or MRL_PASSWORD; do not put it in reports.');
  process.exit(1);
}

function assertSafeApi() {
  if (base.includes(':5055') || base.includes(':5000') || base.includes(':5176')) {
    throw new Error(`Refusing demo/group API ${base}`);
  }
}

async function req(path, { method = 'GET', token, body, raw } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  if (raw) return { status: res.status, json };
  return { status: res.status, json };
}

async function login(email) {
  const res = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200 || !res.json?.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  const user = res.json.data.user || res.json.data;
  return { token: res.json.data.token, user: { ...user, id: user.id || user._id } };
}

function brief(n) {
  return {
    contractorId: n.contractorId,
    category: 'PLUMBING',
    title: `Prompt21 cancel ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    description: 'Customer cancel pending request check on DEV',
    address: 'Ninh Kieu, Can Tho',
    lat: 10.0452,
    lng: 105.7469,
    locationConfirmed: true,
    locationSource: 'MAP_PIN',
  };
}

async function createPending(token, contractorId) {
  return req('/api/repair-requests', { method: 'POST', token, body: brief({ contractorId }) });
}

async function requestRow(pg, id) {
  const row = await pg.query(
    `SELECT r.id, r.legacy_mongo_id, r.status, r.title,
            cu.email AS customer_email, co.email AS contractor_email
     FROM repair_requests r
     JOIN users cu ON cu.id = r.customer_user_id
     JOIN users co ON co.id = r.contractor_user_id
     WHERE r.legacy_mongo_id = $1 OR r.id::text = $1`,
    [id]
  );
  return row.rows[0] || null;
}

async function roomCount(pg, id) {
  const row = await pg.query(
    `SELECT COUNT(*)::int AS n
     FROM chat_rooms cr
     JOIN repair_requests r ON r.id = cr.repair_request_id
     WHERE r.legacy_mongo_id = $1 OR r.id::text = $1`,
    [id]
  );
  return row.rows[0].n;
}

async function messageCount(pg, id) {
  const row = await pg.query(
    `SELECT COUNT(*)::int AS n
     FROM messages m
     JOIN chat_rooms cr ON cr.id = m.chat_room_id
     JOIN repair_requests r ON r.id = cr.repair_request_id
     WHERE r.legacy_mongo_id = $1 OR r.id::text = $1`,
    [id]
  );
  return row.rows[0].n;
}

async function cancelNotifyCount(pg, id) {
  const row = await pg.query(
    `SELECT COUNT(*)::int AS n
     FROM notifications
     WHERE title = 'Request cancelled'
       AND (meta->>'requestId' = $1 OR meta::text LIKE '%' || $1 || '%')`,
    [id]
  );
  return row.rows[0].n;
}

async function acceptNotifyCount(pg, id) {
  const row = await pg.query(
    `SELECT COUNT(*)::int AS n
     FROM notifications
     WHERE title = 'Request accepted'
       AND (meta->>'requestId' = $1 OR meta::text LIKE '%' || $1 || '%')`,
    [id]
  );
  return row.rows[0].n;
}

async function quoteCount(pg, id) {
  const row = await pg.query(
    `SELECT COUNT(*)::int AS n
     FROM quotations q
     JOIN repair_requests r ON r.id = q.repair_request_id
     WHERE r.legacy_mongo_id = $1 OR r.id::text = $1`,
    [id]
  );
  return row.rows[0].n;
}

async function main() {
  assertSafeApi();
  const dbUrl = assertDevDatabaseUrl(process.env.DEV_DATABASE_URL);
  const health = await req('/api/health');
  const results = [];
  const pass = (name, ok, detail) => {
    results.push({ name, ok, detail });
    if (!ok) throw new Error(`FAIL ${name}: ${detail}`);
  };

  pass('health', health.status === 200, `status=${health.status}`);

  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  try {
    const db = await pg.query('SELECT current_database() AS name, inet_server_port() AS port');
    pass('pg-dev', db.rows[0].name === 'BuilMate_dev' && Number(db.rows[0].port) === 5432, `${db.rows[0].name}`);

    const guest = await req('/api/repair-requests/000000000000000000000000/cancel', { method: 'PATCH' });
    pass('guest-401', guest.status === 401, `status=${guest.status}`);

    const badToken = await req('/api/repair-requests/000000000000000000000000/cancel', {
      method: 'PATCH',
      token: 'not-a-real-token',
    });
    pass('bad-token-401', badToken.status === 401, `status=${badToken.status}`);

    const customer = await login('demo.customer@buildmate.test');
    const contractor = await login('demo.contractor@buildmate.test');
    const store = await login('demo.store@buildmate.test');
    pass('login-three-roles', true, 'customer/contractor/store');

    const otherEmail = 'prompt21.other@buildmate.test';
    const otherExists = await pg.query('SELECT id FROM users WHERE email = $1', [otherEmail]);
    if (!otherExists.rows.length) {
      await pg.query(
        `INSERT INTO users (
           role_id, full_name, email, password_hash, account_status, email_verified,
           accepted_policy, profile_status, legacy_mongo_id
         )
         SELECT role_id, 'Prompt21 Other Customer', $1, password_hash, 'ACTIVE', true,
                true, 'COMPLETE', $2
         FROM users WHERE email = 'demo.customer@buildmate.test'`,
        [otherEmail, `a21${Date.now().toString(16).padStart(21, '0')}`.slice(0, 24)]
      );
    } else {
      await pg.query(
        `UPDATE users SET
           password_hash = (SELECT password_hash FROM users WHERE email = 'demo.customer@buildmate.test'),
           account_status = 'ACTIVE',
           email_verified = true
         WHERE email = $1`,
        [otherEmail]
      );
    }
    const other = await login(otherEmail);
    pass('other-customer-login', Boolean(other?.token), 'second customer');

    const financeBefore = await pg.query(
      `SELECT
         (SELECT COUNT(*)::int FROM payments) AS payments,
         (SELECT COUNT(*)::int FROM commissions) AS commissions,
         (SELECT COUNT(*)::int FROM quotations) AS quotations`
    );

    const created = await createPending(customer.token, contractor.user.id);
    const id = created.json?.data?.id;
    pass('create-pending', (created.status === 201 || created.status === 200) && Boolean(id), `http=${created.status} id=${id || ''}`);
    const pgPending = await requestRow(pg, id);
    pass('pg-pending', pgPending?.status === 'PENDING', pgPending?.status || 'missing');
    const roomId = created.json.data.roomId;
    pass('create-has-room', Boolean(roomId), String(roomId || ''));
    const roomsBefore = await roomCount(pg, id);
    const messagesBefore = await messageCount(pg, id);

    const contractorCancel = await req(`/api/repair-requests/${id}/cancel`, { method: 'PATCH', token: contractor.token });
    pass('contractor-cancel-403', contractorCancel.status === 403, `status=${contractorCancel.status}`);

    const storeCancel = await req(`/api/repair-requests/${id}/cancel`, { method: 'PATCH', token: store.token });
    pass('store-cancel-403', storeCancel.status === 403, `status=${storeCancel.status}`);

    const otherCancel = await req(`/api/repair-requests/${id}/cancel`, { method: 'PATCH', token: other.token });
    pass('other-customer-403', otherCancel.status === 403, `status=${otherCancel.status}`);

    const missing = await req('/api/repair-requests/000000000000000000000000/cancel', { method: 'PATCH', token: customer.token });
    pass('missing-404', missing.status === 404, `status=${missing.status}`);

    const cancelled = await req(`/api/repair-requests/${id}/cancel`, { method: 'PATCH', token: customer.token });
    pass('owner-cancel-200', cancelled.status === 200 && cancelled.json?.data?.status === 'CANCELLED', `status=${cancelled.status} req=${cancelled.json?.data?.status}`);

    const pgCancelled = await requestRow(pg, id);
    pass('pg-cancelled', pgCancelled?.status === 'CANCELLED', pgCancelled?.status || 'missing');

    const roomsAfter = await roomCount(pg, id);
    const messagesAfter = await messageCount(pg, id);
    pass('chat-room-kept', roomsAfter === roomsBefore && roomsAfter >= 1, `before=${roomsBefore} after=${roomsAfter}`);
    pass('chat-messages-kept', messagesAfter === messagesBefore, `before=${messagesBefore} after=${messagesAfter}`);

    const notifyOnce = await cancelNotifyCount(pg, id);
    pass('notify-once', notifyOnce === 1, `n=${notifyOnce}`);

    const second = await req(`/api/repair-requests/${id}/cancel`, { method: 'PATCH', token: customer.token });
    pass('second-cancel-409', second.status === 409, `status=${second.status} msg=${second.json?.message || ''}`);
    const notifyAgain = await cancelNotifyCount(pg, id);
    pass('notify-no-duplicate', notifyAgain === 1, `n=${notifyAgain}`);

    const acceptAfter = await req(`/api/repair-requests/${id}/accept`, { method: 'PATCH', token: contractor.token });
    pass('accept-cancelled-409', acceptAfter.status === 409, `status=${acceptAfter.status}`);
    const rejectAfter = await req(`/api/repair-requests/${id}/reject`, { method: 'PATCH', token: contractor.token });
    pass('reject-cancelled-409', rejectAfter.status === 409, `status=${rejectAfter.status}`);
    pass('accept-no-success-notify', (await acceptNotifyCount(pg, id)) === 0, 'no accept notify');

    const quote = await req('/api/quotations', {
      method: 'POST',
      token: contractor.token,
      body: {
        requestId: id,
        items: [{ type: 'LABOR', name: 'Cancelled job', quantity: 1, unit: 'job', price: 100000 }],
        estimatedDays: 2,
      },
    });
    pass('quote-cancelled-409', quote.status === 409, `status=${quote.status} msg=${quote.json?.message || ''}`);
    pass('no-quotation-row', (await quoteCount(pg, id)) === 0, 'quotations=0');

    const accepted = await createPending(customer.token, contractor.user.id);
    pass('create-for-accept', accepted.status === 201 || accepted.status === 200, `status=${accepted.status}`);
    const acceptedId = accepted.json.data.id;
    const didAccept = await req(`/api/repair-requests/${acceptedId}/accept`, { method: 'PATCH', token: contractor.token });
    pass('accept-pending-200', didAccept.status === 200 && didAccept.json?.data?.status === 'ACCEPTED', `status=${didAccept.status}`);
    const cancelAccepted = await req(`/api/repair-requests/${acceptedId}/cancel`, { method: 'PATCH', token: customer.token });
    pass('cancel-accepted-409', cancelAccepted.status === 409, `status=${cancelAccepted.status}`);
    const stillAccepted = await requestRow(pg, acceptedId);
    pass('pg-still-accepted', stillAccepted?.status === 'ACCEPTED', stillAccepted?.status || 'missing');

    const raceA = await createPending(customer.token, contractor.user.id);
    const raceB = await createPending(customer.token, contractor.user.id);
    pass('create-race-pair', (raceA.status === 201 || raceA.status === 200) && (raceB.status === 201 || raceB.status === 200), `${raceA.json?.data?.id}/${raceB.json?.data?.id}`);

    const [cancelRace, acceptRace] = await Promise.all([
      req(`/api/repair-requests/${raceA.json.data.id}/cancel`, { method: 'PATCH', token: customer.token }),
      req(`/api/repair-requests/${raceA.json.data.id}/accept`, { method: 'PATCH', token: contractor.token }),
    ]);
    const raceCodes = [cancelRace.status, acceptRace.status].sort();
    const winner = (await requestRow(pg, raceA.json.data.id))?.status;
    const oneSuccess = (cancelRace.status === 200) !== (acceptRace.status === 200);
    pass('race-one-winner', oneSuccess && raceCodes.includes(200) && raceCodes.includes(409), `cancel=${cancelRace.status} accept=${acceptRace.status} pg=${winner}`);
    pass('race-pg-consistent', winner === 'CANCELLED' || winner === 'ACCEPTED', winner || 'missing');
    if (winner === 'CANCELLED') {
      pass('race-cancel-won-no-accept-notify', (await acceptNotifyCount(pg, raceA.json.data.id)) === 0, 'ok');
      pass('race-cancel-won-notify', (await cancelNotifyCount(pg, raceA.json.data.id)) === 1, 'ok');
    } else {
      pass('race-accept-won-no-cancel-notify', (await cancelNotifyCount(pg, raceA.json.data.id)) === 0, 'ok');
      pass('race-accept-won-notify', (await acceptNotifyCount(pg, raceA.json.data.id)) === 1, 'ok');
    }

    const [cancelRace2, acceptRace2] = await Promise.all([
      req(`/api/repair-requests/${raceB.json.data.id}/cancel`, { method: 'PATCH', token: customer.token }),
      req(`/api/repair-requests/${raceB.json.data.id}/accept`, { method: 'PATCH', token: contractor.token }),
    ]);
    const winner2 = (await requestRow(pg, raceB.json.data.id))?.status;
    const oneSuccess2 = (cancelRace2.status === 200) !== (acceptRace2.status === 200);
    pass('race-repeat-one-winner', oneSuccess2 && winner2 && winner2 !== 'PENDING', `cancel=${cancelRace2.status} accept=${acceptRace2.status} pg=${winner2}`);

    const mine = await req('/api/repair-requests/my', { token: customer.token });
    const mineRow = (mine.json?.data || []).find((row) => row.id === id);
    pass('mine-shows-cancelled', mine.status === 200 && mineRow?.status === 'CANCELLED', mineRow?.status || 'missing');

    const received = await req('/api/repair-requests/received', { token: contractor.token });
    const receivedRow = (received.json?.data || []).find((row) => row.id === id);
    pass('received-shows-cancelled', received.status === 200 && receivedRow?.status === 'CANCELLED', receivedRow?.status || 'missing');

    const financeAfter = await pg.query(
      `SELECT
         (SELECT COUNT(*)::int FROM payments) AS payments,
         (SELECT COUNT(*)::int FROM commissions) AS commissions`
    );
    pass(
      'finance-unchanged',
      financeAfter.rows[0].payments === financeBefore.rows[0].payments
        && financeAfter.rows[0].commissions === financeBefore.rows[0].commissions,
      `payments ${financeBefore.rows[0].payments}->${financeAfter.rows[0].payments} commissions ${financeBefore.rows[0].commissions}->${financeAfter.rows[0].commissions}`
    );

    const mrl = await req('/api/material-requirements', { token: contractor.token });
    pass('regression-mrl', mrl.status === 200 && Array.isArray(mrl.json?.data), `status=${mrl.status} n=${mrl.json?.data?.length}`);

    const rooms = await req('/api/chat/rooms', { token: customer.token });
    const storeRoom = (rooms.json?.data || []).find((row) => row.roomKind === 'CUSTOMER_MATERIAL_STORE' || row.storeId);
    pass('regression-store-chat', rooms.status === 200 && Boolean(storeRoom), `status=${rooms.status}`);
  } finally {
    await pg.end();
  }

  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
