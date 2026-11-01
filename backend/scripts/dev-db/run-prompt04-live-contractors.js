#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.email, u.legacy_mongo_id, u.account_status, u.full_name,
           s.name AS store_name, s.status AS store_status, s.store_type,
           cp.verification_status, cp.business_name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN stores s ON s.owner_user_id = u.id
    LEFT JOIN contractor_profiles cp ON cp.user_id = u.id
    WHERE r.name = 'Contractor'
    ORDER BY u.id
    LIMIT 20
  `);
  for (const row of rows) {
    console.log(
      `${row.id} ${row.legacy_mongo_id || '-'} ${row.account_status} store=${row.store_status || '-'} vis=${row.verification_status || '-'} email=${row.email} name=${row.store_name || row.business_name || row.full_name}`
    );
  }
}

main()
  .catch((err) => {
    console.error('FAIL', String(err.message || err).slice(0, 250));
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
