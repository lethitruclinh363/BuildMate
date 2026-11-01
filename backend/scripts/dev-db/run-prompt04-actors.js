#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

async function main() {
  const roles = await prisma.$queryRawUnsafe(`SELECT id, name FROM roles ORDER BY id`);
  console.log('roles', roles.map((r) => `${r.id}:${r.name}`).join(', '));

  const counts = await prisma.$queryRawUnsafe(`
    SELECT r.name AS role, u.account_status, count(*)::int AS n
    FROM users u JOIN roles r ON r.id = u.role_id
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  for (const row of counts) console.log(`count ${row.role} ${row.account_status} ${row.n}`);

  const demo = await prisma.$queryRawUnsafe(`
    SELECT u.email, r.name AS role, u.account_status, u.email_verified
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.email ILIKE '%demo%'
       OR u.email ILIKE '%buildmate.test%'
       OR u.email ILIKE '%buildmate.vn%'
    ORDER BY r.name, u.email
    LIMIT 40
  `);
  for (const row of demo) console.log(`actor ${row.role} ${row.email} ${row.account_status} verified=${row.email_verified}`);

  const unpaid = await prisma.$queryRawUnsafe(`
    SELECT so.status, so.payment_status, p.status AS pay_status, p.payment_type, count(*)::int AS n
    FROM service_orders so
    LEFT JOIN payments p ON p.quotation_id = so.quotation_id
    WHERE so.status IN ('DEPOSIT_PAID','STARTED','IN_PROGRESS','COMPLETED','CUSTOMER_ACCEPTED')
    GROUP BY 1,2,3,4
    ORDER BY 1,2,3,4
  `);
  for (const row of unpaid) {
    console.log(`order ${row.status} payOrder=${row.payment_status} pay=${row.pay_status}/${row.payment_type} n=${row.n}`);
  }

  const payTypes = await prisma.$queryRawUnsafe(`
    SELECT payment_type, status, count(*)::int AS n FROM payments GROUP BY 1,2 ORDER BY 1,2
  `);
  for (const row of payTypes) console.log(`payment ${row.payment_type} ${row.status} ${row.n}`);
}

main()
  .catch((err) => {
    console.error('FAIL', String(err.message || err).slice(0, 300));
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
