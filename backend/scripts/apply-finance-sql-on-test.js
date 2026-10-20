#!/usr/bin/env node
/**
 * Applies contractor escrow SQL on TEST_DATABASE_URL only.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  loadTestEnv,
  requireIsolatedTestDatabase,
  databaseName,
} = require('../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const name = databaseName(url);
  const sqlPath = path.resolve(__dirname, 'sql/2026-contractor-escrow-material-free.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    if (String(who.rows[0].db).toLowerCase() === 'builmate') {
      throw new Error('Refusing to apply finance SQL on BuilMate');
    }
    await client.query(sql);
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'service_order_escrows', 'contractor_payouts', 'escrow_ledger',
          'escrow_refunds', 'escrow_cancellations'
        )
      ORDER BY table_name
    `);
    console.log(JSON.stringify({
      database: name,
      applied: sqlPath.replace(/\\/g, '/').split('/').slice(-1)[0],
      tables: tables.rows.map((row) => row.table_name),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
