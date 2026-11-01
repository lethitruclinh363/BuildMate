#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT u.email, r.name AS role, u.account_status
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.email ILIKE '%@buildmate.vn'
    ORDER BY r.name, u.email
  `);
  for (const row of rows) console.log(`${row.role} ${row.email} ${row.account_status}`);
}

main()
  .catch((err) => {
    console.error('FAIL', String(err.message || err).slice(0, 200));
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
