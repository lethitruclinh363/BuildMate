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
    const who = await client.query('SELECT current_database() AS db, inet_server_port() AS port');
    const store = await client.query(`
      SELECT s.id, s.legacy_mongo_id, s.name, s.status, s.store_type, s.verified,
             s.base_delivery_fee, s.delivery_fee_per_km, s.free_delivery_radius_km,
             s.delivery_enabled, s.service_radius_km, u.email, u.legacy_mongo_id AS owner_legacy
      FROM stores s
      JOIN users u ON u.id = s.owner_user_id
      WHERE u.email ILIKE 'demo.store@buildmate.test'
    `);
    const materials = await client.query(`
      SELECT m.id, m.legacy_mongo_id, m.name, m.sku, m.price, m.stock, m.is_active, m.store_id
      FROM materials m
      WHERE m.name = 'Demo Portland Cement'
      ORDER BY m.id DESC
    `);
    const orders = await client.query(`
      SELECT mo.id, mo.legacy_mongo_id, mo.order_code, mo.status, mo.payment_status,
             mo.material_subtotal, mo.shipping_fee, mo.total_amount, mo.deposit_amount,
             mo.deposit_rate_snapshot, mo.platform_fee_amount, mo.platform_fee_rate_snapshot,
             mo.store_deposit_amount, mo.remaining_amount, mo.remaining_settled_offline,
             mo.customer_user_id, mo.store_id, mo.store_owner_user_id, mo.distance_km,
             cu.email AS customer_email, su.email AS store_email, s.name AS store_name
      FROM material_orders mo
      JOIN users cu ON cu.id = mo.customer_user_id
      JOIN users su ON su.id = mo.store_owner_user_id
      JOIN stores s ON s.id = mo.store_id
      ORDER BY mo.id DESC
      LIMIT 8
    `);
    const items = await client.query(`
      SELECT i.material_order_id, i.name_snapshot, i.price_snapshot, i.quantity, i.line_total, i.unit_snapshot
      FROM material_order_items i
      JOIN material_orders mo ON mo.id = i.material_order_id
      ORDER BY i.material_order_id DESC, i.sort_order
      LIMIT 20
    `);
    const history = await client.query(`
      SELECT h.material_order_id, h.status, h.actor_role, h.note, h.created_at
      FROM material_order_status_history h
      JOIN material_orders mo ON mo.id = h.material_order_id
      ORDER BY h.id DESC
      LIMIT 40
    `);
    const payments = await client.query(`
      SELECT p.id, p.material_order_id, p.amount, p.platform_fee_amount, p.status, p.provider
      FROM material_order_payments p
      ORDER BY p.id DESC
      LIMIT 10
    `);
    const commissions = await client.query(`SELECT count(*)::int AS n FROM material_commissions`);
    const escrow = await client.query(`SELECT count(*)::int AS n FROM service_order_escrows`);
    const payouts = await client.query(`
      SELECT count(*)::int AS n
      FROM service_order_escrows
      WHERE payout_status IS NOT NULL AND payout_status NOT IN ('NONE', 'UNPAID', '')
    `).catch(() => ({ rows: [{ n: 0 }] }));
    console.log(JSON.stringify({
      database: who.rows[0].db,
      port: who.rows[0].port,
      store: store.rows,
      materials: materials.rows,
      orders: orders.rows,
      items: items.rows,
      history: history.rows,
      materialOrderPayments: payments.rows,
      materialCommissions: commissions.rows[0].n,
      serviceOrderEscrows: escrow.rows[0].n,
      nonIdlePayouts: payouts.rows[0].n,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
