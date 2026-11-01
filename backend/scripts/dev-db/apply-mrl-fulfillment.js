#!/usr/bin/env node
/**
 * Expands MRL fulfillment statuses on BuilMate_dev only.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

async function main() {
  const url = assertDevDatabaseUrl(process.env.DEV_DATABASE_URL);
  const sql = fs.readFileSync(path.join(__dirname, '21-mrl-fulfillment.sql'), 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    if (who.rows[0].db !== 'BuilMate_dev') {
      throw new Error(`Connected to ${who.rows[0].db}, expected BuilMate_dev`);
    }
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ db: who.rows[0].db, applied: '21-mrl-fulfillment.sql' })}\n`);
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
