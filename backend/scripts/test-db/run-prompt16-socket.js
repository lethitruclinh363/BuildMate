#!/usr/bin/env node
/**
 * Two independent socket.io clients (customer + contractor JWTs) against :5055.
 * Proves realtime receive_message without sharing browser storage.
 * Does not print tokens.
 */
const path = require('path');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();
requireIsolatedTestDatabase();

const io = require(path.resolve(__dirname, '../../../frontend/node_modules/socket.io-client'));
const BASE = 'http://127.0.0.1:5055';

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

async function login(email, password) {
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
  const customer = await login('demo.customer@buildmate.test', 'Demo@1234');
  const contractor = await login('demo.contractor@buildmate.test', 'Demo@1234');
  const rooms = await request('/chat/rooms', { token: customer.token });
  const room = (rooms.json?.data || []).find((item) => item.requestId || item.repairRequestId || item.type === 'REPAIR')
    || (rooms.json?.data || [])[0];
  if (!room) throw new Error('no chat room');
  const roomId = room.id || room._id;

  const customerSock = connect(customer.token);
  await waitConnect(customerSock, 'customer');
  await new Promise((r) => setTimeout(r, 400));
  const contractorSock = connect(contractor.token);
  await waitConnect(contractorSock, 'contractor');
  await joinRoom(customerSock, roomId);
  await joinRoom(contractorSock, roomId);

  const marker = `prompt16-rt-${Date.now()}`;
  const received = [];
  contractorSock.on('receive_message', (msg) => {
    received.push({ from: 'contractor', type: msg.type, content: String(msg.content || '').slice(0, 80) });
  });
  customerSock.on('receive_message', (msg) => {
    received.push({ from: 'customer', type: msg.type, content: String(msg.content || '').slice(0, 80) });
  });

  const sent = await new Promise((resolve, reject) => {
    customerSock.emit(
      'send_message',
      { roomId, type: 'TEXT', content: marker },
      (ack) => (ack?.ok ? resolve(ack.data) : reject(new Error(ack?.message || 'send fail')))
    );
  });

  await new Promise((r) => setTimeout(r, 1500));
  const stranger = await login('demo.store@buildmate.test', 'Demo@1234');
  const storeSock = connect(stranger.token);
  await waitConnect(storeSock, 'store');
  let storeJoin = null;
  try {
    storeJoin = await joinRoom(storeSock, roomId);
  } catch (error) {
    storeJoin = { ok: false, message: String(error.message || error).slice(0, 120) };
  }

  const reply = `prompt16-reply-${Date.now()}`;
  await new Promise((resolve, reject) => {
    contractorSock.emit(
      'send_message',
      { roomId, type: 'TEXT', content: reply },
      (ack) => (ack?.ok ? resolve(ack.data) : reject(new Error(ack?.message || 'reply fail')))
    );
  });
  await new Promise((r) => setTimeout(r, 1200));

  customerSock.disconnect();
  contractorSock.disconnect();
  storeSock.disconnect();

  const contractorGotCustomer = received.some((row) => row.from === 'contractor' && row.content.includes(marker));
  const customerGotReply = received.some((row) => row.from === 'customer' && row.content.includes(reply));

  console.log(
    JSON.stringify(
      {
        roomId,
        sentId: sent?.id || sent?._id,
        contractorGotCustomer,
        customerGotReply,
        storeJoinOk: Boolean(storeJoin?.ok),
        receivedCount: received.length,
        received,
      },
      null,
      2
    )
  );
  if (!contractorGotCustomer || !customerGotReply) process.exit(1);
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
