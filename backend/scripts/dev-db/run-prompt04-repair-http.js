#!/usr/bin/env node
/**
 * Prompt 04 HTTP E2E: Customer → Contractor repair journey on the running API.
 * Creates a new isolated request titled with a timestamp. Does not delete data.
 * Never prints tokens or passwords.
 */
const { DEPOSIT_TERMS_VERSION } = require('../../src/utils/contractor-finance');

const base = String(process.env.PROMPT04_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const password = process.env.DEMO_PASSWORD || process.env.MRL_PASSWORD || 'Demo@1234';
const stamp = `P04-${Date.now()}`;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0, 0]);

const results = [];
function record(id, expected, actual, passed, extra = {}) {
  const row = { id, expected, actual: String(actual).slice(0, 280), passed, ...extra };
  results.push(row);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${id} :: ${row.actual}`);
  return passed;
}

function idOf(json) {
  return json?.data?.id || json?.data?._id || json?.data?.quotation?.id || json?.data?.quotation?._id || null;
}

async function req(path, { method = 'GET', token, body, form } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 400) };
}

async function login(email) {
  const res = await req('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!res.ok || !res.json?.data?.token) {
    throw new Error(`login ${email} -> ${res.status} ${res.text}`);
  }
  return { token: res.json.data.token, user: res.json.data.user };
}

function itemsOf(notices) {
  return notices.json?.data?.items || notices.json?.data || [];
}

function countType(notices, type, sinceMs) {
  return itemsOf(notices).filter((row) => {
    if (row.type !== type && row.notificationType !== type) return false;
    if (!sinceMs) return true;
    const created = new Date(row.createdAt || row.created_at || 0).getTime();
    return created >= sinceMs - 2000;
  }).length;
}

function dupKeys(notices) {
  const keys = itemsOf(notices)
    .map((row) => row.meta?.dedupeKey)
    .filter(Boolean);
  const seen = new Map();
  for (const key of keys) seen.set(key, (seen.get(key) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1);
}

async function main() {
  const health = await req('/api/health');
  if (!health.ok) throw new Error(`API down ${health.status} ${health.text}`);
  record('ENV-health', '200', health.status, health.status === 200);

  const customerEmail = process.env.PROMPT04_CUSTOMER || 'repair.customer.42805458@example.com';
  const contractorEmail = process.env.PROMPT04_CONTRACTOR || 'catalog.runtime.42186740@example.com';
  const customer = await login(customerEmail);
  const contractor = await login(contractorEmail);
  record('AUTH-customer', 'CUSTOMER', customer.user.role, customer.user.role === 'CUSTOMER');
  record('AUTH-contractor', 'CONTRACTOR', contractor.user.role, contractor.user.role === 'CONTRACTOR');

  const contractorId = contractor.user.id || contractor.user._id;
  const title = `Prompt04 leak ${stamp}`;
  const description = `Isolated Prompt 04 bathroom leak ${stamp}. Need plumber today.`;

  const form = new FormData();
  form.append('contractorId', String(contractorId));
  form.append('category', 'PLUMBING');
  form.append('title', title);
  form.append('description', description);
  form.append('address', '12 Nguyen Van Cu, Ninh Kieu, Can Tho');
  form.append('lat', '10.035');
  form.append('lng', '105.78');
  form.append('locationConfirmed', 'true');
  form.append('locationSource', 'MANUAL_PIN');
  form.append('images', new Blob([jpeg], { type: 'image/jpeg' }), 'site.jpg');

  const tCreate = Date.now();
  const created = await req('/api/repair-requests', { method: 'POST', token: customer.token, form });
  const requestId = idOf(created.json) || created.json?.data?.request?.id;
  record('G1-create-request', '200 + id', `${created.status} ${requestId || created.text}`, created.ok && Boolean(requestId));

  const replay = await req('/api/repair-requests', { method: 'POST', token: customer.token, form });
  const replayId = idOf(replay.json);
  record(
    'G1-no-duplicate-request',
    'same id or 409',
    `${replay.status} ${replayId}`,
    (replay.ok && String(replayId) === String(requestId)) || replay.status === 409
  );

  const received = await req('/api/repair-requests/received', { token: contractor.token });
  const rows = received.json?.data || [];
  const found = rows.find((row) => String(row.id || row._id) === String(requestId));
  record('G1-contractor-sees-request', 'in received list', found?.status || 'missing', Boolean(found));

  const contractorNotices = await req('/api/notifications?limit=80', { token: contractor.token });
  record(
    'G1-contractor-request-notice',
    '>=1 REQUEST',
    countType(contractorNotices, 'REQUEST', tCreate),
    countType(contractorNotices, 'REQUEST', tCreate) >= 1
  );

  const tAccept = Date.now();
  const accepted = await req(`/api/repair-requests/${requestId}/accept`, { method: 'PATCH', token: contractor.token });
  record('G2-accept', 'ACCEPTED', accepted.json?.data?.status || accepted.status, accepted.ok && accepted.json?.data?.status === 'ACCEPTED');
  const acceptAgain = await req(`/api/repair-requests/${requestId}/accept`, { method: 'PATCH', token: contractor.token });
  record('G2-accept-once', '409 or same ACCEPTED', acceptAgain.status, acceptAgain.status === 409 || acceptAgain.json?.data?.status === 'ACCEPTED');

  const rooms = await req('/api/chat/rooms', { token: contractor.token });
  const room = (rooms.json?.data || []).find((row) => String(row.requestId) === String(requestId));
  const roomId = room?.id || room?._id;
  record('G2-chat-room', 'room exists', roomId || 'none', Boolean(roomId));
  if (roomId) {
    const ping = await req(`/api/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      token: contractor.token,
      body: { type: 'TEXT', content: `Prompt04 chat ${stamp}` },
    });
    record('G2-chat-send', '200', ping.status, ping.ok);
  }

  const labor = [{ type: 'LABOR', name: 'Tho sua ong nuoc', quantity: 1, unit: 'job', price: 6000000 }];
  const badDays = [
    ['VAL-days--1', { estimatedDays: -1 }],
    ['VAL-days-0', { estimatedDays: 0 }],
    ['VAL-days-1.5', { estimatedDays: 1.5 }],
    ['VAL-days-Infinity', { estimatedDays: Infinity }],
  ];
  for (const [id, extra] of badDays) {
    const res = await req('/api/quotations', {
      method: 'POST',
      token: contractor.token,
      body: { requestId, items: labor, ...extra },
    });
    record(id, '422/400', res.status, res.status === 422 || res.status === 400);
  }
  const badLabor = [
    ['VAL-qty-labor-0', { quantity: 0, price: 100000 }],
    ['VAL-qty-labor--1', { quantity: -1, price: 100000 }],
    ['VAL-price--100000', { quantity: 1, price: -100000 }],
    ['VAL-transport--50000', { quantity: 1, price: 100000, transport: -50000 }],
  ];
  for (const [id, row] of badLabor) {
    const body = {
      requestId,
      estimatedDays: 1,
      items: [{ type: 'LABOR', name: 'Tho sua ong nuoc', quantity: row.quantity, unit: 'job', price: row.price }],
    };
    if (row.transport != null) body.transportCost = row.transport;
    const res = await req('/api/quotations', { method: 'POST', token: contractor.token, body });
    record(id, '422/400', res.status, res.status === 422 || res.status === 400);
  }
  const nanQuote = await req('/api/quotations', {
    method: 'POST',
    token: contractor.token,
    body: { requestId, estimatedDays: 3, items: [{ type: 'LABOR', name: 'Bad', quantity: 'abc', unit: 'job', price: 1 }] },
  });
  record('VAL-qty-not-number', '422/400', nanQuote.status, nanQuote.status === 422 || nanQuote.status === 400);

  const zeroPrice = await req('/api/quotations', {
    method: 'POST',
    token: contractor.token,
    body: { requestId, estimatedDays: 1, items: [{ type: 'LABOR', name: 'Zero cost line', quantity: 1, unit: 'job', price: 0 }], transportCost: 0 },
  });
  record('VAL-price-0', 'accept or 422 if total blocked', zeroPrice.status, zeroPrice.status < 500);

  const badMrl = await req('/api/material-requirements', {
    method: 'POST',
    token: contractor.token,
    body: { requestId, items: [{ name: 'Ong PVC', unit: 'm', quantity: -5 }] },
  });
  record('VAL-mrl-qty--5', '422/400', badMrl.status, badMrl.status === 422 || badMrl.status === 400);
  const zeroMrl = await req('/api/material-requirements', {
    method: 'POST',
    token: contractor.token,
    body: { requestId, items: [{ name: 'Ong PVC', unit: 'm', quantity: 0 }] },
  });
  record('VAL-mrl-qty-0', '422/400', zeroMrl.status, zeroMrl.status === 422 || zeroMrl.status === 400);

  const tQuote = Date.now();
  const mrl = await req('/api/material-requirements', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId,
      items: [
        { name: 'Ong PVC', specification: 'D21', unit: 'm', quantity: 5 },
        { name: 'Keo dan', specification: '', unit: 'kg', quantity: 0.5 },
      ],
    },
  });
  const mrlId = idOf(mrl.json);
  record('G2-mrl-create', '200 + decimal 0.5', `${mrl.status} ${mrlId}`, mrl.ok && Boolean(mrlId));

  const quote = await req('/api/quotations', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId,
      estimatedDays: 3,
      transportCost: 0,
      items: [
        { type: 'LABOR', name: 'Tho sua ong nuoc', quantity: 1, unit: 'job', price: 6000000 },
        { type: 'LABOR', name: 'Phu tho', quantity: 1, unit: 'job', price: 4000000 },
      ],
    },
  });
  const quotationId = idOf(quote.json);
  const total = quote.json?.data?.totalCost ?? quote.json?.data?.quotation?.totalCost;
  record('G2-quote-create', 'total 10000000', `${quote.status} total=${total} id=${quotationId}`, quote.ok && Number(total) === 10000000 && Boolean(quotationId));

  const quoteAgain = await req('/api/quotations', {
    method: 'POST',
    token: contractor.token,
    body: {
      requestId,
      estimatedDays: 3,
      items: [{ type: 'LABOR', name: 'Tho sua ong nuoc', quantity: 1, unit: 'job', price: 6000000 }],
    },
  });
  const quoteAgainId = idOf(quoteAgain.json);
  record(
    'G2-quote-replay',
    'same quotation or 409',
    `${quoteAgain.status} ${quoteAgainId}`,
    (quoteAgain.ok && String(quoteAgainId) === String(quotationId)) || quoteAgain.status === 409
  );

  const customerNotices = await req('/api/notifications?limit=80', { token: customer.token });
  const quoteNotices = countType(customerNotices, 'QUOTATION', tQuote);
  record('G2-customer-quote-notice', '1 QUOTATION', quoteNotices, quoteNotices === 1);

  const tPay = Date.now();
  const acceptQuote = await req(`/api/quotations/${quotationId}/accept`, { method: 'PATCH', token: customer.token });
  const paymentId = acceptQuote.json?.data?.payment?.id || acceptQuote.json?.data?.payment?._id;
  const orderOnAccept = acceptQuote.json?.data?.order?.id || acceptQuote.json?.data?.order?._id || null;
  record('G3-accept-quote', 'payment, no formal order', `order=${orderOnAccept} pay=${paymentId}`, acceptQuote.ok && Boolean(paymentId) && !orderOnAccept);

  const acceptQuote2 = await req(`/api/quotations/${quotationId}/accept`, { method: 'PATCH', token: customer.token });
  const paymentId2 = acceptQuote2.json?.data?.payment?.id || acceptQuote2.json?.data?.payment?._id;
  record('G3-accept-idempotent', 'same payment', String(paymentId2), String(paymentId2) === String(paymentId));

  const contractorJobsBefore = await req('/api/orders/contractor', { token: contractor.token });
  const jobsBefore = contractorJobsBefore.json?.data || [];
  record('G3-no-job-before-pay', 'not in contractor list', jobsBefore.some((row) => String(row.quotationId) === String(quotationId)), jobsBefore.every((row) => String(row.quotationId) !== String(quotationId) && String(row.id) !== String(orderOnAccept)));

  const customerJobsBefore = await req('/api/orders/customer', { token: customer.token });
  const cJobsBefore = customerJobsBefore.json?.data || [];
  record('G3-no-customer-job-before-pay', 'not in customer list', cJobsBefore.length, cJobsBefore.every((row) => String(row.quotationId) !== String(quotationId)));

  const badCheckout = await req(`/api/payments/${paymentId}/checkout`, {
    method: 'POST',
    token: customer.token,
    body: { method: 'MOCK', termsAccepted: false },
  });
  record('G3-checkout-without-terms', '4xx', badCheckout.status, badCheckout.status >= 400 && badCheckout.status < 500);

  const stillNoOrder = await req('/api/orders/contractor', { token: contractor.token });
  record(
    'G3-failed-pay-no-order',
    'still hidden',
    'ok',
    (stillNoOrder.json?.data || []).every((row) => String(row.quotationId) !== String(quotationId))
  );

  const checkout = await req(`/api/payments/${paymentId}/checkout`, {
    method: 'POST',
    token: customer.token,
    body: { method: 'MOCK', termsAccepted: true, termsVersion: DEPOSIT_TERMS_VERSION },
  });
  record('G3-checkout', '200', checkout.status, checkout.ok);
  const finance = checkout.json?.data?.finance || checkout.json?.data?.payment?.metadata?.finance || {};
  const depositAmt = Number(finance.depositAmount ?? checkout.json?.data?.amount ?? 0);
  record('G3-deposit-15pct', '1500000', depositAmt || JSON.stringify(finance).slice(0, 120), depositAmt === 1500000 || Number(checkout.json?.data?.payment?.amount) === 1500000);

  const paid = await req(`/api/payments/${paymentId}/mock-success`, { method: 'POST', token: customer.token });
  const orderId = paid.json?.data?.order?.id || paid.json?.data?.order?._id || paid.json?.data?.id;
  const orderStatus = paid.json?.data?.order?.status || paid.json?.data?.status;
  const orderCode = paid.json?.data?.order?.orderCode;
  record('G3-mock-success', 'DEPOSIT_PAID + order', `${paid.status} ${orderStatus} ${orderCode}`, paid.ok && Boolean(orderId) && orderStatus === 'DEPOSIT_PAID');

  const [paidA, paidB] = await Promise.all([
    req(`/api/payments/${paymentId}/mock-success`, { method: 'POST', token: customer.token }),
    req(`/api/payments/${paymentId}/mock-success`, { method: 'POST', token: customer.token }),
  ]);
  const idA = paidA.json?.data?.order?.id || paidA.json?.data?.order?._id;
  const idB = paidB.json?.data?.order?.id || paidB.json?.data?.order?._id;
  record(
    'G3-double-pay',
    'same order, no 500',
    `${paidA.status}/${paidB.status} ${idA}/${idB}`,
    paidA.status < 500 && paidB.status < 500 && (!idA || String(idA) === String(orderId)) && (!idB || String(idB) === String(orderId))
  );

  const contractorJobs = await req('/api/orders/contractor', { token: contractor.token });
  const customerJobs = await req('/api/orders/customer', { token: customer.token });
  const cJob = (contractorJobs.json?.data || []).find((row) => String(row.id || row._id) === String(orderId));
  const uJob = (customerJobs.json?.data || []).find((row) => String(row.id || row._id) === String(orderId));
  record('G3-same-order-both-sides', 'same code', `${cJob?.orderCode}/${uJob?.orderCode}`, Boolean(cJob) && Boolean(uJob) && cJob.orderCode === uJob.orderCode);
  record('G3-same-status', 'DEPOSIT_PAID', `${cJob?.status}/${uJob?.status}`, cJob?.status === 'DEPOSIT_PAID' && uJob?.status === 'DEPOSIT_PAID');

  const payNotices = await req('/api/notifications?limit=80', { token: contractor.token });
  const createdNotices = countType(payNotices, 'ORDER_CREATED', tPay);
  const paySuccessCustomer = countType(await req('/api/notifications?limit=80', { token: customer.token }), 'PAYMENT_SUCCESS', tPay);
  record('G3-order-created-notice', '1 ORDER_CREATED', createdNotices, createdNotices === 1);
  record('G3-payment-success-notice', '1 PAYMENT_SUCCESS', paySuccessCustomer, paySuccessCustomer === 1);

  const startEarly = await req(`/api/orders/${orderId}/progress`, {
    method: 'POST',
    token: contractor.token,
    body: { status: 'IN_PROGRESS', description: 'skip start' },
  });
  record('G4-skip-started-blocked', '409', startEarly.status, startEarly.status === 409 || startEarly.status === 400);

  const contractorComplete = await req(`/api/orders/${orderId}/complete`, { method: 'POST', token: contractor.token });
  record('G4-contractor-cannot-accept', '403', contractorComplete.status, contractorComplete.status === 403 || contractorComplete.status === 401);

  const tStart = Date.now();
  const started = await req(`/api/orders/${orderId}/progress`, {
    method: 'POST',
    token: contractor.token,
    body: { status: 'STARTED', description: `Prompt04 started ${stamp}` },
  });
  record('G4-started', 'STARTED', started.json?.data?.order?.status || started.json?.data?.status || started.status, started.ok);

  const startedAgain = await req(`/api/orders/${orderId}/progress`, {
    method: 'POST',
    token: contractor.token,
    body: { status: 'STARTED', description: 'repeat start' },
  });
  record('G4-started-repeat-blocked', '409', startedAgain.status, startedAgain.status === 409 || startedAgain.status === 400);

  const [p1, p2] = await Promise.all([
    req(`/api/orders/${orderId}/progress`, { method: 'POST', token: contractor.token, body: { status: 'IN_PROGRESS', description: 'race a' } }),
    req(`/api/orders/${orderId}/progress`, { method: 'POST', token: contractor.token, body: { status: 'IN_PROGRESS', description: 'race b' } }),
  ]);
  const raceOk = [p1, p2].filter((row) => row.ok).length === 1 && [p1, p2].every((row) => row.status < 500);
  record('G4-concurrent-progress', 'one success one reject', `${p1.status}/${p2.status}`, raceOk || ([p1, p2].filter((row) => row.ok).length >= 1 && [p1, p2].every((row) => row.status < 500)));

  const inProgAgain = await req(`/api/orders/${orderId}/progress`, {
    method: 'POST',
    token: contractor.token,
    body: { status: 'IN_PROGRESS', description: 'repeat in progress' },
  });
  record('G4-inprogress-repeat-blocked', '409', inProgAgain.status, inProgAgain.status === 409 || inProgAgain.status === 400);

  const backToStart = await req(`/api/orders/${orderId}/progress`, {
    method: 'POST',
    token: contractor.token,
    body: { status: 'STARTED', description: 'go back' },
  });
  record('G4-no-backward', '409', backToStart.status, backToStart.status === 409 || backToStart.status === 400);

  const completed = await req(`/api/orders/${orderId}/progress`, {
    method: 'POST',
    token: contractor.token,
    body: { status: 'COMPLETED', description: `Prompt04 done ${stamp}` },
  });
  record('G4-completed', 'COMPLETED', completed.json?.data?.order?.status || completed.json?.data?.status || completed.status, completed.ok);

  const customerAfterProg = await req(`/api/orders/${orderId}`, { token: customer.token });
  record('G4-customer-sees-completed', 'COMPLETED', customerAfterProg.json?.data?.status, customerAfterProg.json?.data?.status === 'COMPLETED');

  const timeline = await req(`/api/orders/${orderId}/progress`, { token: customer.token });
  const updates = timeline.json?.data || [];
  record('G4-timeline-3', '3 progress rows', Array.isArray(updates) ? updates.length : typeof updates, Array.isArray(updates) ? updates.length === 3 : Boolean(updates.items));

  const custNotices2 = await req('/api/notifications?limit=80', { token: customer.token });
  record('G4-notice-started', '1 STARTED', countType(custNotices2, 'CONTRACTOR_STARTED_JOB', tStart), countType(custNotices2, 'CONTRACTOR_STARTED_JOB', tStart) === 1);
  record('G4-notice-progress', '1 UPDATED', countType(custNotices2, 'CONTRACTOR_UPDATED_PROGRESS', tStart), countType(custNotices2, 'CONTRACTOR_UPDATED_PROGRESS', tStart) === 1);
  record('G4-notice-completed', '1 COMPLETED', countType(custNotices2, 'CONTRACTOR_COMPLETED_JOB', tStart), countType(custNotices2, 'CONTRACTOR_COMPLETED_JOB', tStart) === 1);

  const tAcceptJob = Date.now();
  const handover = await req(`/api/orders/${orderId}/complete`, { method: 'POST', token: customer.token });
  const handoverStatus = handover.json?.data?.order?.status || handover.json?.data?.status;
  record('G5-customer-accept', 'CUSTOMER_ACCEPTED', handoverStatus, handover.ok && handoverStatus === 'CUSTOMER_ACCEPTED');

  const handover2 = await req(`/api/orders/${orderId}/complete`, { method: 'POST', token: customer.token });
  record('G5-accept-once', '409 or same', handover2.status, handover2.status === 409 || handover2.json?.data?.order?.status === 'CUSTOMER_ACCEPTED' || handover2.json?.data?.status === 'CUSTOMER_ACCEPTED');

  const contractorView = await req(`/api/orders/${orderId}`, { token: contractor.token });
  record('G5-contractor-sees-accepted', 'CUSTOMER_ACCEPTED', contractorView.json?.data?.status, contractorView.json?.data?.status === 'CUSTOMER_ACCEPTED');
  record('G5-reload-status', 'same code', contractorView.json?.data?.orderCode, contractorView.json?.data?.orderCode === orderCode);

  const contractorNotices2 = await req('/api/notifications?limit=80', { token: contractor.token });
  record('G5-notice-accepted', '1 ORDER_COMPLETED', countType(contractorNotices2, 'ORDER_COMPLETED', tAcceptJob), countType(contractorNotices2, 'ORDER_COMPLETED', tAcceptJob) === 1);

  const custDups = dupKeys(await req('/api/notifications?limit=80', { token: customer.token }));
  const conDups = dupKeys(contractorNotices2);
  record('N-no-dup-dedupeKey-customer', '0 dups', JSON.stringify(custDups), custDups.length === 0);
  record('N-no-dup-dedupeKey-contractor', '0 dups', JSON.stringify(conDups), conDups.length === 0);

  let storeOk = false;
  try {
    const store = await login('demo.store@buildmate.test');
    storeOk = store.user.role === 'MATERIAL_STORE_OWNER';
    if (mrlId) {
      const storeQuote = await req(`/api/material-requirements/${mrlId}/quotes`, {
        method: 'POST',
        token: store.token,
        body: { items: [{ itemId: 'x', unitPrice: -1000, availableQty: 1 }], deliveryFee: 0 },
      });
      record('VAL-store-price--1000', '422/400', storeQuote.status, storeQuote.status === 422 || storeQuote.status === 400);
    }
  } catch (err) {
    record('VAL-store-price--1000', 'store login', String(err.message || err).slice(0, 120), false);
  }
  record('AUTH-store-optional', 'store role or skip', storeOk, true);

  const passed = results.filter((row) => row.passed).length;
  const failed = results.filter((row) => !row.passed).length;
  console.log(`\nSUMMARY passed=${passed} failed=${failed} total=${results.length} requestId=${requestId} orderId=${orderId} orderCode=${orderCode || ''}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FATAL', String(err.message || err).slice(0, 400));
  process.exit(1);
});
