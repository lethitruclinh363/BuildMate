#!/usr/bin/env node
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db, inet_server_port() AS port');
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('Refusing inspect outside BuilMate_test');
    const storeCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stores' ORDER BY ordinal_position
    `);
    const materialCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'materials' ORDER BY ordinal_position
    `);
    const serviceCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'services' ORDER BY ordinal_position
    `);
    const stores = await client.query(`SELECT * FROM stores`);
    const mats = await client.query(`SELECT * FROM materials`);
    const svcs = await client.query(`SELECT * FROM services`);
    const users = await client.query(`
      SELECT u.id, u.legacy_mongo_id, u.email, u.profile_status
      FROM users u
      WHERE u.email LIKE '%@buildmate.test' AND u.email NOT LIKE 'uniq-race%'
      ORDER BY u.id
    `);
    const profiles = await client.query(`SELECT * FROM contractor_profiles LIMIT 5`).catch(() => ({ rows: [] }));
    console.log(
      JSON.stringify(
        {
          who: who.rows[0],
          storeCols: storeCols.rows.map((row) => row.column_name),
          materialCols: materialCols.rows.map((row) => row.column_name),
          serviceCols: serviceCols.rows.map((row) => row.column_name),
          users: users.rows,
          stores: stores.rows,
          materials: mats.rows,
          services: svcs.rows,
          profiles: profiles.rows,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
