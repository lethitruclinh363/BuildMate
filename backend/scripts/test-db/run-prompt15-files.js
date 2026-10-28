#!/usr/bin/env node
/**
 * Prompt 15 file-access checks against isolated API :5055 only.
 * Does not print tokens or file contents.
 */
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();
requireIsolatedTestDatabase();

const BASE = 'http://127.0.0.1:5055';

async function hit(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  return { path, status: res.status, type: res.headers.get('content-type') || '' };
}

async function login(email, password, admin) {
  const res = await fetch(`${BASE}/api${admin ? '/admin/auth/login' : '/auth/login'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`login ${email} ${res.status}`);
  return json.data.token;
}

async function main() {
  const guestUnknown = await hit('/uploads/contractors/not-a-real-id/cccd.jpg');
  const guestLegacy = await hit('/uploads/contractors/6abc6f5deabc336b4169925c/cccd-front.jpg');
  const guestStores = await hit('/uploads/stores/does-not-exist/cover.jpg');
  const guestUsers = await hit('/uploads/users/does-not-exist/avatar.jpg');
  const guestDocs = await hit('/api/contractor/verification/documents/x/file');
  const guestAdminFile = await hit('/api/admin/verifications/x/documents/y/file');
  const badToken = await hit('/api/repair-requests', { Authorization: 'Bearer not-a-real-token' });
  const guestAnalytics = await hit('/api/admin/analytics');

  const customer = await login('demo.customer@buildmate.test', 'Demo@1234', false);
  const customerDocs = await hit('/api/contractor/verification/documents/x/file', {
    Authorization: `Bearer ${customer}`,
  });
  const customerAdmin = await hit('/api/admin/analytics', {
    Authorization: `Bearer ${customer}`,
  });

  const admin = await login('demo.admin@buildmate.test', 'Admin@1234', true);
  const adminOverview = await hit('/api/admin/analytics', {
    Authorization: `Bearer ${admin}`,
  });

  console.log(
    JSON.stringify(
      {
        guestUnknown,
        guestLegacy,
        guestStores,
        guestUsers,
        guestDocs,
        guestAdminFile,
        guestAnalytics,
        badToken,
        customerDocs: { status: customerDocs.status },
        customerAdmin: { status: customerAdmin.status },
        adminOverview: { status: adminOverview.status },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
