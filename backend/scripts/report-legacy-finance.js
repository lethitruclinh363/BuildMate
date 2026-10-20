#!/usr/bin/env node
/**
 * Read-only legacy finance inventory.
 * Runs only against TEST_DATABASE_URL. Never writes. Never targets BuilMate.
 */
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase, databaseName } = require('../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const name = databaseName(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const full = await client.query(`
      SELECT id, service_order_id, payment_type, status, amount
      FROM payments
      WHERE payment_type = 'FULL_PAYMENT'
      ORDER BY id
    `);
    const material = await client.query(`
      SELECT id, order_code, status, deposit_amount, platform_fee_amount, payment_status
      FROM material_orders
      WHERE COALESCE(deposit_amount, 0) > 0 OR COALESCE(deposit_rate_snapshot, 0) > 0
      ORDER BY id
    `);
    let commissions = { rowCount: 0, rows: [] };
    try {
      commissions = await client.query(`
        SELECT id, platform_amount, store_amount, status
        FROM material_commissions
        ORDER BY id
      `);
    } catch (_err) {
      commissions = { rowCount: 0, rows: [] };
    }
    console.log(JSON.stringify({
      database: name,
      mock: true,
      fullPaymentContractor: full.rowCount,
      legacyMaterialDeposits: material.rowCount,
      materialCommissions: commissions.rowCount,
      note: 'Do not convert these rows to zero. Manual handling only.',
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
