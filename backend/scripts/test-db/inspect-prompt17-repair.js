#!/usr/bin/env node
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const who = await pg.query(
      `SELECT current_database() AS db, inet_server_port() AS inet_port`
    );
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('wrong db');
    const req = await pg.query(`
      SELECT r.id, r.legacy_mongo_id, r.title, r.status,
             q.legacy_mongo_id AS quote_id, q.status AS quote_status, q.total_cost,
             q.labor_cost, q.transport_cost,
             so.legacy_mongo_id AS order_id, so.order_code, so.status AS order_status
      FROM repair_requests r
      LEFT JOIN quotations q ON q.repair_request_id = r.id
      LEFT JOIN service_orders so ON so.repair_request_id = r.id
      WHERE r.legacy_mongo_id = 'a8016e93da4ac6433cbcddf8'
    `);
    console.log(JSON.stringify({ who: who.rows[0], row: req.rows[0] || null }, null, 2));
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
