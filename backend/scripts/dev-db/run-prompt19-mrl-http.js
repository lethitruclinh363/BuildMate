#!/usr/bin/env node
/**
 * HTTP integration for MRL on the isolated DEV stack (BuilMate_dev / :5065).
 * Refuses to run against 55432 or BuilMate / BuilMate_test.
 */
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

const base = String(process.env.MRL_API_URL || 'http://127.0.0.1:5065').replace(/\/$/, '');
const password = process.env.MRL_PASSWORD;
if (!password) {
  console.error('Set MRL_PASSWORD in the environment; do not put it in reports.');
  process.exit(1);
}

function assertSafeApi() {
  if (base.includes(':5055') || base.includes(':5000')) {
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
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (raw) return { status: res.status, json };
  return { status: res.status, json };
}

async function login(email) {
  const res = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200 || !res.json?.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status} ${res.json?.message || ''}`);
  }
  return { token: res.json.data.token, user: res.json.data.user || res.json.data };
}

async function main() {
  assertSafeApi();
  if (process.env.DEV_DATABASE_URL) assertDevDatabaseUrl(process.env.DEV_DATABASE_URL);

  const health = await req('/api/health');
  const results = [];
  const pass = (name, ok, detail) => {
    results.push({ name, ok, detail });
    if (!ok) throw new Error(`FAIL ${name}: ${detail}`);
  };

  pass('health', health.status === 200, `status=${health.status}`);

  const contractor = await login('demo.contractor@buildmate.test');
  const store = await login('demo.store@buildmate.test');
  const customer = await login('demo.customer@buildmate.test');
  pass('login-three-roles', true, 'contractor/store/customer');

  const guest = await req('/api/material-requirements');
  pass('guest-401', guest.status === 401, `status=${guest.status}`);

  const customerCreate = await req('/api/material-requirements', {
    method: 'POST',
    token: customer.token,
    body: { requestId: '0d926aeb9d99c3ebac6ed933' },
  });
  pass('customer-create-403', customerCreate.status === 403 || customerCreate.status === 401, `status=${customerCreate.status}`);

  const received = await req('/api/repair-requests/received', { token: contractor.token });
  const requests = received.json?.data || [];
  const target = requests.find((row) => row.status === 'ACCEPTED' || row.status === 'COMPLETED')
    || { id: '0d926aeb9d99c3ebac6ed933', status: 'ACCEPTED' };
  pass('contractor-has-request', Boolean(target.id), target.id);

  const created = await req('/api/material-requirements', {
    method: 'POST',
    token: contractor.token,
    body: { requestId: target.id },
  });
  pass('create-mrl', created.status === 200 || created.status === 201, `status=${created.status} id=${created.json?.data?.id}`);
  const list = created.json.data;
  if (list.status === 'CONFIRMED' || list.status === 'QUOTED' || list.status === 'SENT') {
    pass('reuse-existing-non-draft', true, list.status);
  }

  if (list.status === 'DRAFT') {
    if ((list.items || []).length < 1) {
      const a = await req(`/api/material-requirements/${list.id}/items`, {
        method: 'POST',
        token: contractor.token,
        body: { name: 'PCB40 cement', specification: '50kg', unit: 'bao', quantity: 10 },
      });
      pass('add-item-1', a.status === 201 || a.status === 200, `status=${a.status}`);
    }
    const b = await req(`/api/material-requirements/${list.id}/items`, {
      method: 'POST',
      token: contractor.token,
      body: { name: 'Ceramic tile', specification: '60x60', unit: 'm2', quantity: 12.5 },
    });
    pass('add-item-2-decimal', b.status === 201 || b.status === 200, `status=${b.status}`);

    const empty = await req(`/api/material-requirements/${list.id}/items`, {
      method: 'POST',
      token: contractor.token,
      body: { name: '', quantity: 1 },
    });
    pass('reject-empty-name', empty.status === 422, `status=${empty.status}`);

    const badQty = await req(`/api/material-requirements/${list.id}/items`, {
      method: 'POST',
      token: contractor.token,
      body: { name: 'Sand', quantity: 0 },
    });
    pass('reject-zero-qty', badQty.status === 422, `status=${badQty.status}`);

    const storeTryCreate = await req('/api/material-requirements', {
      method: 'POST',
      token: store.token,
      body: { requestId: target.id },
    });
    pass('store-cannot-create', storeTryCreate.status === 403, `status=${storeTryCreate.status}`);

    const eligible = await req(`/api/material-requirements/${list.id}/eligible-stores`, { token: contractor.token });
    pass('eligible-stores', eligible.status === 200 && Array.isArray(eligible.json?.data) && eligible.json.data.length > 0, `n=${eligible.json?.data?.length}`);
    const storeId = eligible.json.data[0].storeId;

    const fakeSend = await req(`/api/material-requirements/${list.id}/send`, {
      method: 'POST',
      token: contractor.token,
      body: { storeId: 'ffffffffffffffffffffffff' },
    });
    pass('send-unknown-store', fakeSend.status === 404 || fakeSend.status === 409, `status=${fakeSend.status}`);

    const customerSend = await req(`/api/material-requirements/${list.id}/send`, {
      method: 'POST',
      token: customer.token,
      body: { storeId },
    });
    pass('customer-cannot-send', customerSend.status === 403, `status=${customerSend.status}`);

    const sent = await req(`/api/material-requirements/${list.id}/send`, {
      method: 'POST',
      token: contractor.token,
      body: { storeId },
    });
    pass('send-ok', sent.status === 200 && sent.json?.data?.status === 'SENT', sent.json?.data?.status);
    const sentAgain = await req(`/api/material-requirements/${list.id}/send`, {
      method: 'POST',
      token: contractor.token,
      body: { storeId },
    });
    pass('send-double-click', sentAgain.status === 409, `status=${sentAgain.status}`);
  }

  const latest = await req(`/api/material-requirements/${list.id}`, { token: contractor.token });
  const current = latest.json.data;
  pass('contractor-get', latest.status === 200, current.status);

  const storeList = await req('/api/material-requirements', { token: store.token });
  const inbox = (storeList.json?.data || []).find((row) => row.id === current.id);
  pass('store-inbox', Boolean(inbox), `n=${storeList.json?.data?.length}`);

  const storeGet = await req(`/api/material-requirements/${current.id}`, { token: store.token });
  pass('store-get', storeGet.status === 200, storeGet.json?.data?.status);

  if (current.status === 'SENT') {
    const quoteItems = (storeGet.json.data.items || []).map((item) => ({
      itemId: item.id,
      unitPrice: 200000,
      availableQty: item.quantity,
    }));
    const quoted = await req(`/api/material-requirements/${current.id}/quotes`, {
      method: 'POST',
      token: store.token,
      body: { items: quoteItems, deliveryFee: 100000, note: 'Prompt19 quote' },
    });
    pass('store-quote', quoted.status === 201 || quoted.status === 200, quoted.json?.data?.status);
    const quotedAgain = await req(`/api/material-requirements/${current.id}/quotes`, {
      method: 'POST',
      token: store.token,
      body: { items: quoteItems, deliveryFee: 100000 },
    });
    pass('quote-double-click', quotedAgain.status === 409, `status=${quotedAgain.status}`);
  }

  const afterQuote = await req(`/api/material-requirements/${current.id}`, { token: contractor.token });
  pass('contractor-sees-quote', afterQuote.status === 200 && afterQuote.json?.data?.status === 'QUOTED', afterQuote.json?.data?.status);
  const storeConfirm = await req(`/api/material-requirements/${current.id}/confirm`, {
    method: 'POST',
    token: store.token,
  });
  pass('store-cannot-confirm', storeConfirm.status === 403, `status=${storeConfirm.status}`);
  const confirmed = await req(`/api/material-requirements/${current.id}/confirm`, {
    method: 'POST',
    token: contractor.token,
  });
  pass('contractor-confirm', confirmed.status === 200 && confirmed.json?.data?.status === 'CONFIRMED', confirmed.json?.data?.status);
  const confirmedAgain = await req(`/api/material-requirements/${current.id}/confirm`, {
    method: 'POST',
    token: contractor.token,
  });
  pass('confirm-double-click', confirmedAgain.status === 409, `status=${confirmedAgain.status}`);

  const customerGet = await req(`/api/material-requirements/${current.id}`, { token: customer.token });
  pass('customer-cannot-get', customerGet.status === 403, `status=${customerGet.status}`);

  process.stdout.write(`${JSON.stringify({ base, listId: current.id, requestId: current.requestId, status: 'CONFIRMED', results }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
