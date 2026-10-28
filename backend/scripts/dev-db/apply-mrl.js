#!/usr/bin/env node
/**
 * Applies Material Requirement List tables to BuilMate_dev only.
 * Refuses BuilMate (group) and BuilMate_test (locked demo).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

function requireDevUrl() {
  return assertDevDatabaseUrl(process.env.DEV_DATABASE_URL);
}

async function main() {
  const url = requireDevUrl();
  const sql = fs.readFileSync(path.join(__dirname, '18-material-requirement.sql'), 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db, inet_server_port() AS port');
    const db = who.rows[0].db;
    if (db !== 'BuilMate_dev') {
      throw new Error(`Connected to ${db}, expected BuilMate_dev`);
    }
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'material_requirement_lists',
          'material_requirement_items',
          'material_quotes',
          'material_quote_items'
        )
      ORDER BY table_name
    `);
    process.stdout.write(`${JSON.stringify({ db, tables: tables.rows.map((row) => row.table_name) })}\n`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
