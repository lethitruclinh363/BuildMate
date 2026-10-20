#!/usr/bin/env node
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test.docker') });

function redact(message) {
  return String(message || '').replace(process.env.TEST_PGPASSWORD || '', '').replace(/:[^:@/]+@/g, ':***@');
}

async function main() {
  const client = new Client({
    host: process.env.TEST_PGHOST,
    port: Number(process.env.TEST_PGPORT),
    user: process.env.TEST_PGUSER,
    password: process.env.TEST_PGPASSWORD,
    database: 'BuilMate_test',
    ssl: false,
  });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'service_orders', 'payments', 'commissions', 'material_orders',
          'material_order_payments', 'material_commissions',
          'service_order_escrows', 'contractor_payouts', 'escrow_ledger',
          'escrow_refunds', 'escrow_cancellations', 'roles', 'users'
        )
      ORDER BY table_name
    `);
    const users = await client.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE email LIKE '%@buildmate.test'`
    );
    const identityIndexes = await client.query(`
      SELECT i.relname AS indexname,
             ix.indisunique AS is_unique,
             ix.indisvalid AS is_valid,
             pg_get_indexdef(ix.indexrelid) AS indexdef
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'users'
        AND i.relname IN ('uq_users_email_lower', 'uq_users_phone_number_nonempty')
      ORDER BY i.relname
    `);
    if (identityIndexes.rowCount !== 2 || identityIndexes.rows.some((row) => !row.is_unique || !row.is_valid)) {
      throw new Error('BuilMate_test is missing valid UNIQUE indexes uq_users_email_lower and/or uq_users_phone_number_nonempty');
    }
    console.log(JSON.stringify({
      database: who.rows[0].db,
      tables: tables.rows.map((row) => row.table_name),
      testActorEmails: users.rows[0].count,
      identityIndexes: identityIndexes.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
