#!/usr/bin/env node
/**
 * Two independent Socket.io JWTs (customer + store) against DEV :5065.
 * Proves realtime receive_message without sharing a browser profile.
 * Does not print tokens.
 */
const path = require('path');
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

const BASE = String(process.env.CHAT_API_URL || 'http://127.0.0.1:5065').replace(/\/$/, '');
const password = process.env.CHAT_PASSWORD || process.env.MRL_PASSWORD;
const STORE_ID = '82a98eb32f87abb362a131ba';
const io = require(path.resolve(__dirname, '../../../frontend/node_modules/socket.io-client'));

if (!password) {
  console.error('Set CHAT_PASSWORD or MRL_PASSWORD; do not put it in reports.');
  process.exit(1);
}
if (BASE.includes(':5055') || BASE.includes(':5000')) {
  throw new Error(`Refusing demo API ${BASE}`);
}
if (process.env.DEV_DATABASE_URL) assertDevDatabaseUrl(process.env.DEV_DATABASE_URL);

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE}/api${pathname}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

async function login(email) {
  const res = await request('/auth/login', { method: 'POST', body: { email, password } });
  if (!res.ok) throw new Error(`login ${email} ${res.status}`);
  return { token: res.json.data.token, id: res.json.data.user.id || res.json.data.user._id };
}

function connect(token) {
  return io(BASE, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: false,
  });
}

function waitConnect(socket, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} connect timeout`)), 15000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`${label} ${err.message}`));
    });
  });
}

function joinRoom(socket, roomId) {
  return new Promise((resolve, reject) => {
    socket.emit('join_room', { roomId }, (ack) => {
      if (ack?.ok) resolve(ack);
      else reject(new Error(ack?.message || 'join failed'));
    });
  });
}

async function main() {
  const customer = await login('demo.customer@buildmate.test');
  const store = await login('demo.store@buildmate.test');
  const contractor = await login('demo.contractor@buildmate.test');
  const opened = await request(`/chat/stores/${STORE_ID}/rooms`, { method: 'POST', token: customer.token, body: {} });
  if (!opened.ok) throw new Error(`open room ${opened.status}`);
  const roomId = opened.json.data.id;

  const customerSock = connect(customer.token);
  await waitConnect(customerSock, 'customer');
  const storeSock = connect(store.token);
  await waitConnect(storeSock, 'store');
  await joinRoom(customerSock, roomId);
  await joinRoom(storeSock, roomId);

  const received = [];
  storeSock.on('receive_message', (msg) => {
    received.push({ from: 'store', content: String(msg.content || '') });
  });
  customerSock.on('receive_message', (msg) => {
    received.push({ from: 'customer', content: String(msg.content || '') });
  });

  const marker = `prompt20-rt-${Date.now()}`;
  const sent = await new Promise((resolve, reject) => {
    customerSock.emit(
      'send_message',
      { roomId, type: 'TEXT', content: marker },
      (ack) => (ack?.ok ? resolve(ack.data) : reject(new Error(ack?.message || 'send fail')))
    );
  });

  await new Promise((r) => setTimeout(r, 1200));
  const contractorSock = connect(contractor.token);
  await waitConnect(contractorSock, 'contractor');
  let contractorJoin = null;
  try {
    contractorJoin = await joinRoom(contractorSock, roomId);
  } catch (error) {
    contractorJoin = { ok: false, message: String(error.message || error).slice(0, 120) };
  }

  const reply = `prompt20-store-${Date.now()}`;
  await new Promise((resolve, reject) => {
    storeSock.emit(
      'send_message',
      { roomId, type: 'TEXT', content: reply },
      (ack) => (ack?.ok ? resolve(ack.data) : reject(new Error(ack?.message || 'reply fail')))
    );
  });
  await new Promise((r) => setTimeout(r, 1200));

  customerSock.disconnect();
  storeSock.disconnect();
  contractorSock.disconnect();

  const storeGot = received.some((row) => row.from === 'store' && row.content === marker);
  const customerGot = received.some((row) => row.from === 'customer' && row.content === reply);
  const out = {
    ok: storeGot && customerGot && contractorJoin?.ok === false,
    roomId,
    sentId: sent?.id,
    storeGotCustomerText: storeGot,
    customerGotStoreReply: customerGot,
    contractorJoinDenied: contractorJoin?.ok === false,
    receivedCount: received.length,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (!out.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
