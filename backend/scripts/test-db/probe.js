#!/usr/bin/env node
/**
 * Read-only connectivity check for the Docker test cluster.
 * Does not print passwords or full URLs.
 */
const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test.docker'), override: true });

function redact(message) {
  return String(message || '')
    .replace(process.env.TEST_PGPASSWORD || '', '')
    .replace(/:[^:@/]+@/g, ':***@');
}

async function peek(database) {
  const client = new Client({
    host: process.env.TEST_PGHOST,
    port: Number(process.env.TEST_PGPORT),
    user: process.env.TEST_PGUSER,
    password: process.env.TEST_PGPASSWORD,
    database,
    ssl: false,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const row = (await client.query(
      'SELECT current_database() AS db, current_user AS usr, inet_server_port() AS port, current_setting(\'is_superuser\') AS super'
    )).rows[0];
    console.log(`ok database=${row.db} user=${row.usr} port=${row.port} superuser=${row.super}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.TEST_DATABASE_URL || '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (parsed) {
    console.log(`env.test host=${parsed.hostname} port=${parsed.port} database=${decodeURIComponent(parsed.pathname.replace(/^\//, ''))} user=${parsed.username}`);
  } else {
    console.log('env.test TEST_DATABASE_URL missing or invalid');
  }
  console.log(`docker host=${process.env.TEST_PGHOST} port=${process.env.TEST_PGPORT} user=${process.env.TEST_PGUSER} database=${process.env.POSTGRES_DB} password_set=${process.env.TEST_PGPASSWORD ? 'yes' : 'no'}`);
  await peek('postgres');
  await peek('BuilMate_test');
}

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
