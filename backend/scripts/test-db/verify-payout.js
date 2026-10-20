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
    const db = await client.query('SELECT current_database() AS db');
    const escrow = await client.query(`
      SELECT status, payout_status, remaining_settled, released_amount, refunded_amount,
             platform_fee_amount, contractor_hold_amount, mock
      FROM service_order_escrows WHERE id = 195
    `);
    const payouts = await client.query(`
      SELECT id, amount, status, mock FROM contractor_payouts ORDER BY id DESC LIMIT 5
    `);
    const commissions = await client.query(`
      SELECT id, platform_amount, contractor_amount, status, service_order_id
      FROM commissions ORDER BY id DESC LIMIT 5
    `);
    const ledger = await client.query(`
      SELECT id, entry_type, amount, note FROM escrow_ledger ORDER BY id DESC LIMIT 8
    `);
    const indexes = await client.query(`
      SELECT i.relname
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      WHERE t.relname = 'users' AND i.relname IN ('uq_users_email_lower', 'uq_users_phone_number_nonempty')
        AND ix.indisunique AND ix.indisvalid
    `);
    console.log(JSON.stringify({
      database: db.rows[0].db,
      escrow: escrow.rows,
      payouts: payouts.rows,
      commissions: commissions.rows,
      ledger: ledger.rows,
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
