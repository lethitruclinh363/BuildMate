#!/usr/bin/env node
const { Client } = require('pg');
const {
  loadTestEnv,
  requireIsolatedTestDatabase,
} = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db, inet_server_port() AS port');
    const room = await client.query(`
      SELECT cr.id, cr.legacy_mongo_id, cr.customer_user_id, cr.contractor_user_id
      FROM chat_rooms cr
      WHERE cr.legacy_mongo_id = $1
    `, ['cd4b87265d7093d2055b26dc']);
    const request = await client.query(`
      SELECT rr.id, rr.legacy_mongo_id, rr.title, rr.status, rr.customer_user_id, rr.contractor_user_id
      FROM repair_requests rr
      ORDER BY rr.id DESC
      LIMIT 3
    `);
    const quotes = await client.query(`
      SELECT q.id, q.legacy_mongo_id, q.status, q.total_cost, q.repair_request_id, q.chat_room_id
      FROM quotations q
      ORDER BY q.id DESC
      LIMIT 5
    `);
    const orders = await client.query(`
      SELECT so.id, so.legacy_mongo_id, so.order_code, so.status, so.payment_status, so.amount
      FROM service_orders so
      ORDER BY so.id DESC
      LIMIT 5
    `);
    const payments = await client.query(`
      SELECT p.id, p.legacy_mongo_id, p.status, p.amount, p.payment_type, p.service_order_id, p.provider
      FROM payments p
      ORDER BY p.id DESC
      LIMIT 8
    `);
    const escrows = await client.query(`
      SELECT e.id, e.service_order_id, e.status, e.payout_status, e.gross_amount,
             e.platform_fee_amount, e.contractor_hold_amount, e.released_amount, e.refunded_amount, e.mock
      FROM service_order_escrows e
      ORDER BY e.id DESC
      LIMIT 8
    `).catch((err) => ({ rows: [{ error: String(err.message || err) }] }));
    const commissions = await client.query(`
      SELECT c.id, c.status, c.amount, c.service_order_id
      FROM commissions c
      ORDER BY c.id DESC
      LIMIT 8
    `).catch(() => ({ rows: [] }));
    const indexes = await client.query(`
      SELECT i.relname
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      WHERE t.relname = 'users' AND i.relname IN ('uq_users_email_lower', 'uq_users_phone_number_nonempty')
        AND ix.indisunique AND ix.indisvalid
    `);
    console.log(JSON.stringify({
      database: who.rows[0].db,
      port: who.rows[0].port,
      room: room.rows,
      latestRequests: request.rows,
      quotations: quotes.rows,
      orders: orders.rows,
      payments: payments.rows,
      escrows: escrows.rows,
      commissions: commissions.rows,
      identityIndexes: indexes.rows.map((row) => row.relname),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
