#!/usr/bin/env node
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const who = await pg.query(`SELECT current_database() AS db`);
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('wrong db');
    const posted = await pg.query(
      `SELECT count(*)::int AS n, coalesce(sum(platform_amount),0)::numeric AS amount
       FROM commissions WHERE status = 'POSTED'`
    );
    const thisJob = await pg.query(
      `SELECT c.status, c.platform_amount
       FROM commissions c
       JOIN service_orders so ON so.id = c.service_order_id
       WHERE so.legacy_mongo_id = '9659becc235b73d3e23e158a'`
    );
    const quotes = await pg.query(
      `SELECT coalesce(sum(total_cost),0)::numeric AS accepted_quote
       FROM quotations WHERE status = 'ACCEPTED'`
    );
    const room = await pg.query(
      `SELECT cr.legacy_mongo_id AS room_id
       FROM chat_rooms cr
       JOIN repair_requests r ON r.id = cr.repair_request_id
       WHERE r.legacy_mongo_id = 'a8016e93da4ac6433cbcddf8'`
    );
    const openComplaints = await pg.query(
      `SELECT count(*)::int AS n FROM complaints WHERE status IN ('OPEN','PROCESSING')`
    );
    const material = await pg.query(
      `SELECT order_code, status, payment_status, total_amount, platform_fee_amount
       FROM material_orders WHERE legacy_mongo_id = '2414e9844b2027860b276cde'`
    );
    console.log(JSON.stringify({
      who: who.rows[0],
      postedCommissions: posted.rows[0],
      job9659: thisJob.rows,
      acceptedQuote: quotes.rows[0],
      room: room.rows[0] || null,
      openComplaints: openComplaints.rows[0],
      material: material.rows[0] || null,
    }, null, 2));
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
