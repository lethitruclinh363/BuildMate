#!/usr/bin/env node
/**
 * Read-only Prompt 04 scan of the development PostgreSQL.
 * Does not UPDATE/DELETE. Never prints connection strings.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  const row = rows[0] || {};
  const key = Object.keys(row)[0];
  return Number(row[key] || 0);
}

async function main() {
  const who = await prisma.$queryRawUnsafe(`
    SELECT current_database() AS db, inet_server_addr()::text AS addr, inet_server_port() AS port
  `);
  console.log(`db=${who[0].db} host=${who[0].addr} port=${who[0].port}`);

  const checks = [
    ['quotation_items.quantity < 0', `SELECT count(*)::int AS n FROM quotation_items WHERE quantity < 0`],
    ['quotation_items.price < 0', `SELECT count(*)::int AS n FROM quotation_items WHERE price < 0`],
    ['quotations.estimated_days < 1', `SELECT count(*)::int AS n FROM quotations WHERE estimated_days < 1`],
    ['quotations.transport_cost < 0', `SELECT count(*)::int AS n FROM quotations WHERE transport_cost < 0`],
    ['quotations.total_cost < 0', `SELECT count(*)::int AS n FROM quotations WHERE total_cost < 0`],
    ['payments.amount < 0', `SELECT count(*)::int AS n FROM payments WHERE amount < 0`],
    ['service_orders.amount < 0', `SELECT count(*)::int AS n FROM service_orders WHERE amount < 0`],
    ['material_order_items.quantity < 0', `SELECT count(*)::int AS n FROM material_order_items WHERE quantity < 0`],
    ['material_order_items.price_snapshot < 0', `SELECT count(*)::int AS n FROM material_order_items WHERE price_snapshot < 0`],
  ];

  const mrlExists = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'material_requirement_items'
  `);
  if (Number(mrlExists[0].n) > 0) {
    checks.push(['material_requirement_items.quantity < 0', `SELECT count(*)::int AS n FROM material_requirement_items WHERE quantity < 0`]);
    checks.push(['material_requirement_items.quantity = 0', `SELECT count(*)::int AS n FROM material_requirement_items WHERE quantity = 0`]);
  }

  for (const [label, sql] of checks) {
    try {
      const n = await count(sql);
      console.log(`${n === 0 ? 'CLEAN' : 'NEG '} ${label} = ${n}`);
    } catch (err) {
      console.log(`SKIP ${label} :: ${String(err.message || err).slice(0, 120)}`);
    }
  }

  const unpaidFormal = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n
    FROM service_orders so
    LEFT JOIN payments p ON p.quotation_id = so.quotation_id AND p.payment_type = 'DEPOSIT'
    WHERE so.status IN ('DEPOSIT_PAID','STARTED','IN_PROGRESS','COMPLETED','CUSTOMER_ACCEPTED')
      AND (p.id IS NULL OR p.status <> 'PAID')
  `);
  console.log(`unpaid_formal_orders = ${unpaidFormal[0].n}`);

  const dups = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n FROM (
      SELECT meta->>'dedupeKey' AS k, count(*) AS c
      FROM notifications
      WHERE coalesce(meta->>'dedupeKey','') <> ''
      GROUP BY 1
      HAVING count(*) > 1
    ) d
  `);
  console.log(`duplicate_notification_dedupeKey = ${dups[0].n}`);

  const demo = await prisma.$queryRawUnsafe(`
    SELECT email, role, status FROM users
    WHERE email IN ('demo.customer@buildmate.test','demo.contractor@buildmate.test')
    ORDER BY email
  `);
  for (const row of demo) console.log(`actor ${row.email} ${row.role} ${row.status}`);
}

main()
  .catch((err) => {
    console.error('SCAN_FAIL', String(err.message || err).slice(0, 300));
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
