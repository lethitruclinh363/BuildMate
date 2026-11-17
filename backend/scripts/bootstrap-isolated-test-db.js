/**
 * Creates local database BuilMate_test, pushes Prisma schema, seeds fake
 * reference rows, and writes backend/.env.test.
 *
 * Required env (do not use the team BuilMate login):
 *   TEST_PGHOST TEST_PGUSER TEST_PGPASSWORD
 * Optional:
 *   TEST_PGPORT (default 5432)
 *
 * Refuses remote hosts unless TEST_ALLOW_REMOTE=yes.
 * Admin/maintenance session must be database postgres.
 * Application target must be BuilMate_test (never BuilMate / postgres / template0 / template1).
 * Never reads or copies rows from the team database.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.test.admin') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test.docker'), override: true });

const TEST_DATABASE = 'BuilMate_test';
const MAINTENANCE_DATABASE = 'postgres';
const BLOCKED_APP = new Set(['builmate', 'postgres', 'template0', 'template1']);
const LOCAL = new Set(['localhost', '127.0.0.1', '::1']);

function redact(message) {
  return String(message || '')
    .replace(process.env.TEST_PGPASSWORD || '', '')
    .replace(/:[^:@/]+@/g, ':***@');
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in backend/.env.test.admin (gitignored) or the shell.`);
  }
  return value;
}

function adminConfig(database) {
  return {
    host: requireEnv('TEST_PGHOST'),
    port: Number(process.env.TEST_PGPORT || 5432),
    user: requireEnv('TEST_PGUSER'),
    password: requireEnv('TEST_PGPASSWORD'),
    database,
    ssl: false,
  };
}

function isAppBlocked(name) {
  return BLOCKED_APP.has(String(name || '').toLowerCase());
}

function isMaintenance(name) {
  return String(name || '').toLowerCase() === MAINTENANCE_DATABASE;
}

function isTestAppDatabase(name) {
  return String(name || '').toLowerCase() === TEST_DATABASE.toLowerCase() && !isAppBlocked(name);
}

function testUrl() {
  const user = encodeURIComponent(requireEnv('TEST_PGUSER'));
  const password = encodeURIComponent(requireEnv('TEST_PGPASSWORD'));
  const host = requireEnv('TEST_PGHOST');
  const port = process.env.TEST_PGPORT || '5432';
  return `postgresql://${user}:${password}@${host}:${port}/${encodeURIComponent(TEST_DATABASE)}`;
}

async function seedFakeReference(client) {
  await client.query(`
    INSERT INTO roles (code, name, description) VALUES
      ('CUSTOMER', 'Customer', 'Test customer'),
      ('CONTRACTOR', 'Contractor', 'Test contractor'),
      ('MATERIAL_STORE_OWNER', 'Material store owner', 'Test store owner'),
      ('ADMIN', 'Admin', 'Test admin')
    ON CONFLICT (code) DO NOTHING
  `);
  await client.query(`
    INSERT INTO service_categories (name, is_active) VALUES
      ('Plumbing', true),
      ('Waterproofing', true),
      ('Electrical', true)
    ON CONFLICT (name) DO NOTHING
  `);
  const rules = await client.query('SELECT COUNT(*)::int AS count FROM commission_rules');
  if (rules.rows[0].count === 0) {
    await client.query(
      `INSERT INTO commission_rules (name, percentage, is_active)
       VALUES ('Default platform fee', 10, true)`
    );
  }
}

async function main() {
  const host = requireEnv('TEST_PGHOST');
  if (!LOCAL.has(host.toLowerCase()) && process.env.TEST_ALLOW_REMOTE !== 'yes') {
    throw new Error('Refusing a non-local TEST_PGHOST. Use 127.0.0.1 or set TEST_ALLOW_REMOTE=yes after review.');
  }
  if (isAppBlocked(TEST_DATABASE)) {
    throw new Error('Refusing a blocked database name.');
  }

  const admin = new Client(adminConfig(MAINTENANCE_DATABASE));
  await admin.connect();
  try {
    const who = await admin.query(
      `SELECT current_database() AS db, current_setting('is_superuser') AS superuser, current_user AS usr`
    );
    if (!isMaintenance(who.rows[0].db)) {
      throw new Error(
        `Admin session is on a blocked database (${who.rows[0].db}). Connect to maintenance database postgres.`
      );
    }
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DATABASE]);
    if (!found.rowCount) {
      if (who.rows[0].superuser !== 'on') {
        const rights = await admin.query(
          'SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user'
        );
        if (!rights.rows[0]?.rolcreatedb) {
          throw new Error('This PostgreSQL user cannot CREATE DATABASE. Use the local postgres superuser.');
        }
      }
      await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
      console.log(`[bootstrap] Created database ${TEST_DATABASE}`);
    } else {
      console.log(`[bootstrap] Database ${TEST_DATABASE} already exists`);
    }
  } finally {
    await admin.end();
  }

  const url = testUrl();
  const prismaCli = path.resolve(__dirname, '../node_modules/prisma/build/index.js');
  if (!fs.existsSync(prismaCli)) {
    throw new Error('Prisma CLI is missing. Run npm install in backend first.');
  }

  const probe = new Client(adminConfig(TEST_DATABASE));
  await probe.connect();
  let needsPush = true;
  try {
    const db = await probe.query('SELECT current_database() AS db');
    if (!isTestAppDatabase(db.rows[0].db)) {
      throw new Error('Refusing to inspect a blocked database.');
    }
    const core = await probe.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_orders'`
    );
    needsPush = !core.rowCount;
  } finally {
    await probe.end();
  }

  if (needsPush) {
    execFileSync(
      process.execPath,
      [prismaCli, 'db', 'push', '--skip-generate'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATABASE_URL: url,
          BUILDMATE_TEST_DATABASE: 'isolated',
        },
        stdio: 'inherit',
      }
    );
  } else {
    console.log('[bootstrap] Skipping prisma db push; BuilMate_test already has core tables.');
  }

  const test = new Client(adminConfig(TEST_DATABASE));
  await test.connect();
  try {
    const db = await test.query('SELECT current_database() AS db');
    if (!isTestAppDatabase(db.rows[0].db)) {
      throw new Error('Refusing to seed a blocked database.');
    }
    await seedFakeReference(test);
  } finally {
    await test.end();
  }

  const envPath = path.resolve(__dirname, '../.env.test');
  fs.writeFileSync(
    envPath,
    `# Generated by bootstrap-isolated-test-db.js. Do not commit.\nNODE_ENV=test\nTEST_DATABASE_URL=${url}\n`
  );
  console.log('[bootstrap] Wrote backend/.env.test (gitignored). App .env / .env.migration were not changed.');

  const apply = spawnSync(
    process.execPath,
    [path.resolve(__dirname, 'apply-finance-sql-on-test.js')],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: url,
        BUILDMATE_TEST_DATABASE: 'isolated',
      },
    }
  );
  if (apply.status !== 0) {
    throw new Error('Finance SQL was not applied on the isolated test database.');
  }

  const identityUnique = spawnSync(
    process.execPath,
    [path.resolve(__dirname, 'apply-users-identity-unique-on-test.js')],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: url,
        BUILDMATE_TEST_DATABASE: 'isolated',
      },
    }
  );
  if (identityUnique.status !== 0) {
    throw new Error('Login-identity UNIQUE indexes were not applied or verified on BuilMate_test.');
  }

  const seedActors = spawnSync(
    process.execPath,
    [path.resolve(__dirname, 'seed-test-actors.js')],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_DATABASE_URL: url,
        BUILDMATE_TEST_DATABASE: 'isolated',
        NODE_ENV: 'test',
      },
    }
  );
  if (seedActors.status !== 0) {
    throw new Error('Test actors were not seeded on the isolated database.');
  }
}

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
