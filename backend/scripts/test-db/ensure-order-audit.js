const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

async function main() {
  const client = new Client({ connectionString: requireIsolatedTestDatabase() });
  await client.connect();
  try {
    const existing = await client.query('SELECT * FROM audit_logs WHERE entity_type = $1 AND entity_id = $2', ['Order', '13']);
    if (existing.rows.length === 0) {
      await client.query(`
        INSERT INTO audit_logs (legacy_mongo_id, actor_user_id, actor_role, action, entity_type, entity_id, meta, ip, created_at, updated_at)
        VALUES (
          '14a04201795edf75761e18a7',
          1,
          'CUSTOMER',
          'ORDER_CREATED',
          'Order',
          '13',
          '{"orderId": "13", "orderCode": "VL-20261015-5733C2", "isMaterialOrder": true, "amount": 2100000}',
          '',
          NOW(),
          NOW()
        )
      `);
      console.log('Inserted audit log for Order 13');
    } else {
      console.log('Audit log for Order 13 already exists');
    }
  } finally {
    await client.end();
  }
}

main().catch(console.error);
