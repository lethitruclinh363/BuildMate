#!/usr/bin/env node
/**
 * Applies Customer–Store chat columns to BuilMate_dev only.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { assertDevDatabaseUrl } = require('../../src/utils/dev-database-guard');

async function main() {
  const url = assertDevDatabaseUrl(process.env.DEV_DATABASE_URL);
  const sql = fs.readFileSync(path.join(__dirname, '20-customer-store-chat.sql'), 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    if (who.rows[0].db !== 'BuilMate_dev') {
      throw new Error(`Connected to ${who.rows[0].db}, expected BuilMate_dev`);
    }
    const before = await client.query('SELECT COUNT(*)::int AS n FROM chat_rooms');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    const after = await client.query('SELECT COUNT(*)::int AS n FROM chat_rooms');
    const kinds = await client.query('SELECT room_kind, COUNT(*)::int AS n FROM chat_rooms GROUP BY room_kind ORDER BY room_kind');
    process.stdout.write(`${JSON.stringify({
      db: who.rows[0].db,
      roomsBefore: before.rows[0].n,
      roomsAfter: after.rows[0].n,
      kinds: kinds.rows,
    })}\n`);
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
