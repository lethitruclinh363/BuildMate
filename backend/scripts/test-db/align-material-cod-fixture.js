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
    const who = await client.query('SELECT current_database() AS db');
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('Refusing fixture change outside BuilMate_test');
    const updated = await client.query(`
      UPDATE stores
      SET service_radius_km = 50
      WHERE legacy_mongo_id = '82a98eb32f87abb362a131ba'
      RETURNING id, name, status, service_radius_km, base_delivery_fee, free_delivery_radius_km, delivery_enabled
    `);
    console.log(JSON.stringify({ database: who.rows[0].db, updated: updated.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
