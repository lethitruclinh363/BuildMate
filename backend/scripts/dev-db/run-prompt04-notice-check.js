#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });
const { prisma } = require('../../src/config/prisma');

async function main() {
  const orderCode = process.argv[2] || 'BM-20261030-3D02A3';
  const order = await prisma.$queryRaw`
    SELECT id, legacy_mongo_id, status, order_code, customer_user_id, contractor_user_id
    FROM service_orders WHERE order_code = ${orderCode}
  `;
  if (!order[0]) throw new Error('order not found');
  const o = order[0];
  console.log(`order ${o.order_code} ${o.status} ${o.legacy_mongo_id}`);

  const notices = await prisma.$queryRaw`
    SELECT n.notification_type, n.user_id, n.title, n.meta->>'dedupeKey' AS k, n.created_at
    FROM notifications n
    WHERE n.user_id IN (${o.customer_user_id}, ${o.contractor_user_id})
      AND n.created_at > now() - interval '2 hours'
    ORDER BY n.created_at
  `;
  for (const row of notices) {
    const who = String(row.user_id) === String(o.customer_user_id) ? 'CUST' : 'CON';
    console.log(`${who} ${row.notification_type} ${row.k || '-'} ${row.title}`);
  }

  const progress = await prisma.$queryRaw`
    SELECT status, description, created_at FROM progress_updates
    WHERE service_order_id = ${o.id} ORDER BY created_at
  `;
  console.log('progress_rows', progress.length);
  for (const row of progress) console.log(`  ${row.status} ${row.description}`);
}

main()
  .catch((err) => {
    console.error('FAIL', String(err.message || err).slice(0, 250));
    process.exit(1);
  })
  .finally(async () => {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  });
