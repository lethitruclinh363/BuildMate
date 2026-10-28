#!/usr/bin/env node
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const url = requireIsolatedTestDatabase();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('Refusing catalog change outside BuilMate_test');
    const store = await client.query(`
      SELECT id FROM stores
      WHERE legacy_mongo_id = '82a98eb32f87abb362a131ba' AND store_type = 'MATERIALS'
    `);
    if (!store.rowCount) throw new Error('Demo material store is missing on BuilMate_test');
    const exists = await client.query(`SELECT id FROM materials WHERE sku = 'E2E-TILE-01'`);
    let inserted = { rows: [] };
    if (!exists.rowCount) {
      inserted = await client.query(
        `
        INSERT INTO materials (
          legacy_mongo_id, store_id, material_category_id, name, sku, unit, price, stock,
          min_order_qty, description, is_active, listing_status, sale_availability
        )
        SELECT
          'c0d1e2f3a4b5968778695a4c', $1, material_category_id, 'Demo Ceramic Tile', 'E2E-TILE-01',
          'box', 350000, 40, 1, 'Harmless test tile box for isolated E2E.', true, 'ACTIVE', 'AVAILABLE'
        FROM materials
        WHERE store_id = $1
        ORDER BY id
        LIMIT 1
        RETURNING id, sku, price
      `,
        [store.rows[0].id]
      );
    }
    const count = await client.query('SELECT count(*)::int AS n, array_agg(name) AS names FROM materials WHERE store_id = $1', [
      store.rows[0].id,
    ]);
    console.log(
      JSON.stringify(
        {
          database: who.rows[0].db,
          inserted: inserted.rows,
          materials: count.rows[0],
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
