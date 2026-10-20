#!/usr/bin/env node
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
const { requireIsolatedTestDatabase, databaseName } = require('../../src/tests/helpers/database-safety');

async function main() {
  const url = requireIsolatedTestDatabase();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    if (String(who.rows[0].db).toLowerCase() !== 'builmate_test') {
      throw new Error('Refusing fixture inspect outside BuilMate_test');
    }
    const users = await client.query(`
      SELECT u.id, u.email, r.code AS role, u.account_status, u.email_verified, u.profile_status
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.email LIKE '%@buildmate.test'
      ORDER BY u.id
    `);
    const contractors = await client.query(`
      SELECT cp.user_id, cp.verification_status, cp.is_public, cp.activation_status
      FROM contractor_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE u.email LIKE '%@buildmate.test'
    `).catch(() => ({ rows: [] }));
    const stores = await client.query(`
      SELECT s.id, s.owner_user_id, s.status, s.store_type
      FROM stores s
      JOIN users u ON u.id = s.owner_user_id
      WHERE u.email LIKE '%@buildmate.test'
    `).catch(() => ({ rows: [] }));
    const services = await client.query(`
      SELECT count(*)::int AS n FROM services sv
      JOIN users u ON u.id = sv.contractor_user_id
      WHERE u.email LIKE '%@buildmate.test'
    `).catch(() => ({ rows: [{ n: 0 }] }));
    const materials = await client.query(`
      SELECT count(*)::int AS n FROM materials m
      JOIN stores s ON s.id = m.store_id
      JOIN users u ON u.id = s.owner_user_id
      WHERE u.email LIKE '%@buildmate.test'
    `).catch(() => ({ rows: [{ n: 0 }] }));
    const catalog = await client.query('SELECT count(*)::int AS n FROM catalog_services').catch(() => ({ rows: [{ n: 0 }] }));
    const categories = await client.query('SELECT name FROM service_categories WHERE is_active = true ORDER BY name LIMIT 10').catch(() => ({ rows: [] }));
    console.log(JSON.stringify({
      database: databaseName(url),
      users: users.rows.map((row) => ({
        email: row.email,
        role: row.role,
        account_status: row.account_status,
        email_verified: row.email_verified,
        profile_status: row.profile_status,
      })),
      contractorProfiles: contractors.rows,
      stores: stores.rows,
      services: services.rows[0].n,
      materials: materials.rows[0].n,
      catalogServices: catalog.rows[0].n,
      categories: categories.rows.map((row) => row.name),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
