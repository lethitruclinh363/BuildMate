#!/usr/bin/env node
/**
 * HTTP + PostgreSQL checks for Customer–Material Store chat on DEV (:5065 / BuilMate_dev).
 * Refuses demo API ports. Does not print tokens or passwords.
 */
const { Client } = require('pg');
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

const base = String(process.env.CHAT_API_URL || process.env.MRL_API_URL || 'http://127.0.0.1:5065').replace(/\/$/, '');
const password = process.env.CHAT_PASSWORD || process.env.MRL_PASSWORD;
const STORE_ID = '82a98eb32f87abb362a131ba';

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

  const guestRoom = await req(`/api/chat/stores/${STORE_ID}/rooms`, { method: 'POST', body: {} });
  pass('guest-open-401', guestRoom.status === 401, `status=${guestRoom.status}`);
  const guestList = await req('/api/chat/rooms');
  pass('guest-list-401', guestList.status === 401, `status=${guestList.status}`);

  const customer = await login('demo.customer@buildmate.test');
  const store = await login('demo.store@buildmate.test');
  const contractor = await login('demo.contractor@buildmate.test');
  pass('login-three-roles', true, 'customer/store/contractor');

  const missing = await req('/api/chat/stores/000000000000000000000000/rooms', {
    method: 'POST',
    token: customer.token,
    body: {},
  });
  pass('missing-store', missing.status === 404, `status=${missing.status}`);

  const contractorOpen = await req(`/api/chat/stores/${STORE_ID}/rooms`, {
    method: 'POST',
    token: contractor.token,
    body: {},
  });
  pass('contractor-open-403', contractorOpen.status === 403 || contractorOpen.status === 401, `status=${contractorOpen.status}`);

  const first = await req(`/api/chat/stores/${STORE_ID}/rooms`, {
    method: 'POST',
    token: customer.token,
    body: {},
  });
  pass('customer-open', first.status === 200 && Boolean(first.json?.data?.id), `status=${first.status} kind=${first.json?.data?.roomKind}`);
  const roomId = first.json.data.id;
  pass('room-kind', first.json.data.roomKind === 'CUSTOMER_MATERIAL_STORE', first.json.data.roomKind);
  pass('store-name', Boolean(first.json.data.storeName || first.json.data.contractor?.name), first.json.data.storeName || first.json.data.contractor?.name || '');
  pass('no-owner-phone-on-store-peer', !first.json.data.contractor?.phone, 'store peer omits owner phone');

  const second = await req(`/api/chat/stores/${STORE_ID}/rooms`, {
    method: 'POST',
    token: customer.token,
    body: {},
  });
  pass('reuse-room', second.status === 200 && second.json?.data?.id === roomId, `first=${roomId} second=${second.json?.data?.id}`);

  const [a, b] = await Promise.all([
    req(`/api/chat/stores/${STORE_ID}/rooms`, { method: 'POST', token: customer.token, body: {} }),
    req(`/api/chat/stores/${STORE_ID}/rooms`, { method: 'POST', token: customer.token, body: {} }),
  ]);
  pass('concurrent-open', a.json?.data?.id === roomId && b.json?.data?.id === roomId, `${a.json?.data?.id}/${b.json?.data?.id}`);

  const empty = await req(`/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    token: customer.token,
    body: { type: 'TEXT', content: '   ' },
  });
  pass('empty-text-422', empty.status === 422, `status=${empty.status}`);

  const spoof = await req(`/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    token: customer.token,
    body: { type: 'TEXT', content: 'Xin chào, cửa hàng còn xi măng không?', senderId: store.user.id },
  });
  pass('send-text', spoof.status === 201, `status=${spoof.status}`);
  pass('sender-is-customer', spoof.json?.data?.senderId === customer.user.id, spoof.json?.data?.senderId);

  const storeRooms = await req('/api/chat/rooms', { token: store.token });
  const storeHit = (storeRooms.json?.data || []).find((row) => row.id === roomId);
  pass('store-inbox', Boolean(storeHit), `rooms=${(storeRooms.json?.data || []).length}`);
  pass('store-sees-customer-name', Boolean(storeHit?.otherUser?.name), storeHit?.otherUser?.name || '');

  const contractorRooms = await req('/api/chat/rooms', { token: contractor.token });
  const leak = (contractorRooms.json?.data || []).some((row) => row.id === roomId || row.roomKind === 'CUSTOMER_MATERIAL_STORE');
  pass('contractor-no-store-inbox', !leak, `rooms=${(contractorRooms.json?.data || []).length}`);

  const contractorRead = await req(`/api/chat/rooms/${roomId}`, { token: contractor.token });
  pass('contractor-room-403', contractorRead.status === 403, `status=${contractorRead.status}`);

  const contractorMsgs = await req(`/api/chat/rooms/${roomId}/messages`, { token: contractor.token });
  pass('contractor-messages-403', contractorMsgs.status === 403, `status=${contractorMsgs.status}`);

  const reply = await req(`/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    token: store.token,
    body: { type: 'TEXT', content: 'Cửa hàng còn hàng, bạn cần bao nhiêu bao?' },
  });
  pass('store-reply', reply.status === 201, `status=${reply.status}`);

  const history = await req(`/api/chat/rooms/${roomId}/messages`, { token: customer.token });
  const texts = (history.json?.data || []).map((row) => row.content);
  pass(
    'two-way-history',
    texts.includes('Xin chào, cửa hàng còn xi măng không?') && texts.includes('Cửa hàng còn hàng, bạn cần bao nhiêu bao?'),
    `n=${texts.length}`
  );

  const quote = await req(`/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    token: store.token,
    body: { type: 'QUOTATION', content: 'quote' },
  });
  pass('no-quotation-in-store-chat', quote.status >= 400, `status=${quote.status}`);

  const customerNotes = await req('/api/notifications', { token: customer.token });
  const storeNotes = await req('/api/notifications', { token: store.token });
  const customerItems = customerNotes.json?.data?.items || customerNotes.json?.data || [];
  const storeItems = storeNotes.json?.data?.items || storeNotes.json?.data || [];
  const customerMsgNote = customerItems.find((row) => row.type === 'MESSAGE' && row.link === `/customer/chat/${roomId}`);
  const storeMsgNote = storeItems.find((row) => row.type === 'MESSAGE' && row.link === `/store/chat/${roomId}`);
  pass('notify-customer-link', Boolean(customerMsgNote), customerMsgNote?.link || 'missing');
  pass('notify-store-link', Boolean(storeMsgNote), storeMsgNote?.link || 'missing');

  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  try {
    const who = await pg.query('SELECT current_database() AS db');
    pass('pg-dev', who.rows[0].db === 'BuilMate_dev', who.rows[0].db);
    const kinds = await pg.query('SELECT room_kind, COUNT(*)::int AS n FROM chat_rooms GROUP BY room_kind ORDER BY 1');
    const storeRoomsN = kinds.rows.find((row) => row.room_kind === 'CUSTOMER_MATERIAL_STORE')?.n || 0;
    const repairN = kinds.rows.find((row) => row.room_kind === 'CUSTOMER_CONTRACTOR')?.n || 0;
    pass('pg-store-room', storeRoomsN >= 1, JSON.stringify(kinds.rows));
    pass('pg-repair-rooms-kept', repairN >= 0, `repair=${repairN}`);
    const dup = await pg.query(
      `SELECT customer_user_id, store_id, COUNT(*)::int AS n
       FROM chat_rooms
       WHERE room_kind = 'CUSTOMER_MATERIAL_STORE'
       GROUP BY 1, 2
       HAVING COUNT(*) > 1`
    );
    pass('pg-no-duplicate-pair', dup.rows.length === 0, `dups=${dup.rows.length}`);
    const pair = await pg.query(
      `SELECT cr.id, cr.room_kind, s.name, s.legacy_mongo_id AS store_legacy,
              cu.email AS customer_email, ou.email AS owner_email
       FROM chat_rooms cr
       JOIN stores s ON s.id = cr.store_id
       JOIN users cu ON cu.id = cr.customer_user_id
       JOIN users ou ON ou.id = cr.contractor_user_id
       WHERE cr.legacy_mongo_id = $1 OR cr.id::text = $1`,
      [roomId]
    );
    const row = pair.rows[0];
    pass('pg-pair', Boolean(row) && row.store_legacy === STORE_ID, row ? `${row.store_legacy}/${row.customer_email}` : 'missing');
    const msgs = await pg.query(
      `SELECT COUNT(*)::int AS n FROM messages m
       JOIN chat_rooms cr ON cr.id = m.chat_room_id
       WHERE cr.legacy_mongo_id = $1 OR cr.id::text = $1`,
      [roomId]
    );
    pass('pg-messages', msgs.rows[0].n >= 2, `n=${msgs.rows[0].n}`);
  } finally {
    await pg.end();
  }

  process.stdout.write(`${JSON.stringify({ ok: true, roomId, results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
