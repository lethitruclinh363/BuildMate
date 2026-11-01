#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT u.id, u.email, u.legacy_mongo_id, u.account_status, u.email_verified, u.full_name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'Customer'
      AND (u.email ILIKE '%example.com%' OR u.email ILIKE '%buildmate%' OR u.email ILIKE '%runtime%' OR u.email ILIKE '%catalog%')
    ORDER BY u.id DESC
    LIMIT 25
  `);
  for (const row of rows) {
    console.log(`${row.id} ${row.legacy_mongo_id || '-'} ${row.account_status} v=${row.email_verified} ${row.email} ${row.full_name}`);
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
