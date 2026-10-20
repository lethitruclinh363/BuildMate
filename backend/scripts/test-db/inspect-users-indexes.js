#!/usr/bin/env node
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test.docker') });

function redact(message) {
  return String(message || '').replace(process.env.TEST_PGPASSWORD || '', '').replace(/:[^:@/]+@/g, ':***@');
}

async function main() {
  const client = new Client({
    host: process.env.TEST_PGHOST,
    port: Number(process.env.TEST_PGPORT),
    user: process.env.TEST_PGUSER,
    password: process.env.TEST_PGPASSWORD,
    database: 'BuilMate_test',
    ssl: false,
  });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    const indexes = await client.query(`
      SELECT i.relname AS indexname,
             ix.indisunique AS is_unique,
             ix.indisvalid AS is_valid,
             pg_get_indexdef(ix.indexrelid) AS indexdef
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'users'
      ORDER BY i.relname
    `);
    const dupEmail = await client.query(`
      SELECT lower(email) AS email, count(*)::int AS n
      FROM users
      GROUP BY lower(email)
      HAVING count(*) > 1
      ORDER BY n DESC
      LIMIT 20
    `);
    const dupPhone = await client.query(`
      SELECT phone_number, count(*)::int AS n
      FROM users
      WHERE phone_number IS NOT NULL AND btrim(phone_number) <> ''
      GROUP BY phone_number
      HAVING count(*) > 1
      ORDER BY n DESC
      LIMIT 20
    `);
    console.log(JSON.stringify({
      database: who.rows[0].db,
      indexes: indexes.rows,
      duplicateEmails: dupEmail.rowCount,
      duplicatePhones: dupPhone.rowCount,
      sampleDupEmails: dupEmail.rows.map((row) => ({ n: row.n, suffix: String(row.email).slice(-20) })),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
