#!/usr/bin/env node
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const who = await pg.query('SELECT current_database() AS db');
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('wrong db');
    const reqs = await pg.query(`
      SELECT r.legacy_mongo_id, r.title, r.status, r.category_snapshot, q.total_amount, q.status AS quote_status
      FROM repair_requests r
      LEFT JOIN quotations q ON q.repair_request_id = r.id
      WHERE r.title ILIKE '%Prompt16%'
      ORDER BY r.created_at DESC
      LIMIT 5
    `);
    console.log(JSON.stringify({ database: who.rows[0].db, requests: reqs.rows }, null, 2));
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
