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
    const id = process.argv[2] || '2414e9844b2027860b276cde';
    const order = await pg.query(`SELECT * FROM material_orders WHERE legacy_mongo_id = $1`, [id]);
    const row = order.rows[0] || null;
    const pick = (src, keys) => {
      if (!src) return null;
      const out = {};
      for (const key of keys) if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
      return out;
    };
    const pk = row && row.id;
    let payments = [];
    if (pk) {
      try {
        payments = (await pg.query(`SELECT * FROM payments WHERE material_order_id = $1`, [pk])).rows.map((p) =>
          pick(p, ['payment_type', 'status', 'amount', 'provider'])
        );
      } catch {
        payments = [];
      }
    }
    const count = (await pg.query(`SELECT count(*)::int AS n FROM material_orders WHERE legacy_mongo_id = $1`, [id])).rows[0];
    const repairEscrow = (await pg.query(
      `SELECT count(*)::int AS n FROM service_order_escrows e
       JOIN service_orders so ON so.id = e.service_order_id
       WHERE so.legacy_mongo_id = $1`,
      [id]
    )).rows[0];
    console.log(JSON.stringify({
      who: who.rows[0],
      count,
      order: pick(row, [
        'legacy_mongo_id', 'order_code', 'status', 'payment_status', 'total_amount',
        'deposit_amount', 'platform_fee_amount', 'remaining_settled_offline',
      ]),
      payments,
      repairEscrowForThisId: repairEscrow,
    }, null, 2));
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
