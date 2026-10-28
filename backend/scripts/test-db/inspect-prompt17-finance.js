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
      `SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS inet_port`
    );
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('wrong db');

    const req = await pg.query(`
      SELECT r.id, r.legacy_mongo_id AS request_id, r.title, r.status AS request_status,
             q.legacy_mongo_id AS quote_id, q.status AS quote_status, q.total_cost,
             so.id AS order_pk, so.legacy_mongo_id AS order_id, so.order_code, so.status AS order_status
      FROM repair_requests r
      LEFT JOIN quotations q ON q.repair_request_id = r.id
      LEFT JOIN service_orders so ON so.repair_request_id = r.id
      WHERE r.legacy_mongo_id = 'a8016e93da4ac6433cbcddf8'
    `);

    const orderPk = req.rows[0] && req.rows[0].order_pk;
    async function safe(sql, params) {
      try {
        return { rows: (await pg.query(sql, params)).rows };
      } catch (error) {
        return { error: String(error.message || error) };
      }
    }

    const orderRow = orderPk
      ? await safe('SELECT * FROM service_orders WHERE id = $1', [orderPk])
      : { rows: [] };
    const payments = orderPk
      ? await safe('SELECT * FROM payments WHERE service_order_id = $1 ORDER BY created_at', [orderPk])
      : { rows: [] };
    const escrow = orderPk
      ? await safe('SELECT * FROM service_order_escrows WHERE service_order_id = $1', [orderPk])
      : { rows: [] };
    const commissions = orderPk
      ? await safe('SELECT * FROM commissions WHERE service_order_id = $1', [orderPk])
      : { rows: [] };
    const orderCount = (await pg.query(`
      SELECT COUNT(*)::int AS n FROM service_orders so
      JOIN repair_requests r ON r.id = so.repair_request_id
      WHERE r.legacy_mongo_id = 'a8016e93da4ac6433cbcddf8'
    `)).rows[0];

    const pick = (row, keys) => {
      if (!row) return null;
      const out = {};
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
      }
      return out;
    };

    console.log(JSON.stringify({
      who: who.rows[0],
      repair: req.rows[0] || null,
      orderCount,
      order: (orderRow.rows || []).map((row) => pick(row, [
        'legacy_mongo_id', 'order_code', 'status', 'payment_status', 'quoted_amount',
        'deposit_amount', 'remaining_amount', 'platform_fee_amount',
      ])),
      payments: (payments.rows || []).map((row) => pick(row, [
        'legacy_mongo_id', 'payment_type', 'status', 'amount', 'gross_amount', 'provider', 'created_at',
      ])),
      escrow: (escrow.rows || []).map((row) => pick(row, [
        'status', 'payout_status', 'remaining_settled', 'gross_amount', 'platform_fee_amount',
        'contractor_hold_amount', 'released_amount', 'refunded_amount', 'mock',
      ])),
      commissions: (commissions.rows || []).map((row) => pick(row, [
        'status', 'amount', 'platform_amount', 'created_at',
      ])),
      errors: {
        order: orderRow.error || null,
        payments: payments.error || null,
        escrow: escrow.error || null,
        commissions: commissions.error || null,
      },
    }, null, 2));
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
