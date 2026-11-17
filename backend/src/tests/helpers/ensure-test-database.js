const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const TEST_DATABASE = 'BuilMate_test';
const TEST_SCHEMA = 'buildmate_test';
const MODE_FILE = path.resolve(__dirname, '../../../scripts/migration/output/test-database-mode.txt');
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';

function loadEnv() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.migration'), override: true });
}

function config(database) {
  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database,
    ssl: String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  };
}

function pgEnv() {
  return { ...process.env, PGPASSWORD: process.env.PGPASSWORD };
}

function runPg(tool, args) {
  try {
    execFileSync(path.join(PG_BIN, tool), args, { env: pgEnv(), stdio: 'pipe' });
  } catch (error) {
    const detail = String(error.stderr || error.message || '')
      .replace(process.env.PGPASSWORD || '', '')
      .slice(0, 500);
    throw new Error(`${tool} failed while preparing ${TEST_DATABASE}: ${detail}`);
  }
}

async function connect(database) {
  const client = new Client(config(database));
  await client.connect();
  return client;
}

async function connectAdmin() {
  const candidates = ['postgres', process.env.PGDATABASE].filter(Boolean);
  let lastError;
  for (const database of candidates) {
    try {
      return await connect(database);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Cannot connect to PostgreSQL to prepare ${TEST_DATABASE}: ${lastError?.message || 'unknown error'}`);
}

async function tableCount(client, schema) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    [schema]
  );
  return result.rows[0].count;
}

function writeMode(mode) {
  fs.mkdirSync(path.dirname(MODE_FILE), { recursive: true });
  fs.writeFileSync(MODE_FILE, mode);
}

function dumpSchemaFile() {
  const schemaFile = path.resolve(__dirname, '../../../scripts/migration/output/test-schema.sql');
  fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
  runPg('pg_dump.exe', [
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '--schema', 'public',
    '-h', process.env.PGHOST,
    '-p', String(process.env.PGPORT || 5432),
    '-U', process.env.PGUSER,
    '-d', process.env.PGDATABASE,
    '-f', schemaFile,
  ]);
  return schemaFile;
}

function applyDump(database, sqlFile) {
  runPg('psql.exe', [
    '-h', process.env.PGHOST,
    '-p', String(process.env.PGPORT || 5432),
    '-U', process.env.PGUSER,
    '-d', database,
    '-v', 'ON_ERROR_STOP=1',
    '-f', sqlFile,
  ]);
}

function schemaCopySql(schemaFile) {
  const raw = fs.readFileSync(schemaFile, 'utf8');
  const rewritten = raw
    .replace(/^CREATE SCHEMA public;\s*$/m, `CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA};`)
    .replace(/SET search_path = public/g, `SET search_path = ${TEST_SCHEMA}, public`)
    .replace(/\bpublic\./g, `${TEST_SCHEMA}.`);
  const copyFile = schemaFile.replace(/\.sql$/, '.schema.sql');
  fs.writeFileSync(copyFile, `CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA};\n${rewritten}`);
  return copyFile;
}

async function seedReference(test) {
  const prod = await connect(process.env.PGDATABASE);
  try {
    const roles = await test.query('SELECT COUNT(*)::int AS count FROM roles');
    if (roles.rows[0].count === 0) {
      const source = await prod.query('SELECT code, name, description FROM roles');
      for (const row of source.rows) {
        await test.query(
          'INSERT INTO roles (code, name, description) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING',
          [row.code, row.name, row.description]
        );
      }
    }

    const categories = await prod.query('SELECT name, is_active FROM service_categories');
    for (const row of categories.rows) {
      await test.query(
        'INSERT INTO service_categories (name, is_active) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [row.name, row.is_active]
      );
    }
    for (const name of ['Waterproofing', 'PLUMBING', 'Cement']) {
      await test.query(
        'INSERT INTO service_categories (name, is_active) VALUES ($1, true) ON CONFLICT (name) DO NOTHING',
        [name]
      );
    }

    const cement = await test.query(
      `SELECT 1 FROM material_categories WHERE name = 'Cement' AND owner_user_id IS NULL LIMIT 1`
    );
    if (!cement.rowCount) {
      const source = await prod.query(
        `SELECT name, normalized_name, folded_name, category_type, status
         FROM material_categories
         WHERE owner_user_id IS NULL AND store_id IS NULL`
      );
      for (const row of source.rows) {
        await test.query(
          `INSERT INTO material_categories (name, normalized_name, folded_name, category_type, status)
           SELECT $1, $2, $3, $4, $5
           WHERE NOT EXISTS (
             SELECT 1 FROM material_categories
             WHERE name = $1 AND owner_user_id IS NULL AND store_id IS NULL
           )`,
          [row.name, row.normalized_name, row.folded_name, row.category_type, row.status]
        );
      }
      await test.query(
        `INSERT INTO material_categories (name, normalized_name, folded_name, category_type, status)
         SELECT 'Cement', 'cement', 'cement', 'SYSTEM', 'APPROVED'
         WHERE NOT EXISTS (
           SELECT 1 FROM material_categories
           WHERE name = 'Cement' AND owner_user_id IS NULL
         )`
      );
    }

    const rules = await test.query('SELECT COUNT(*)::int AS count FROM commission_rules');
    if (rules.rows[0].count === 0) {
      const source = await prod.query('SELECT name, percentage, is_active FROM commission_rules');
      for (const row of source.rows) {
        await test.query(
          'INSERT INTO commission_rules (name, percentage, is_active) VALUES ($1, $2, $3)',
          [row.name, row.percentage, row.is_active]
        );
      }
      if (!source.rowCount) {
        await test.query(
          `INSERT INTO commission_rules (name, percentage, is_active) VALUES ('Default platform fee', 10, true)`
        );
      }
    }
  } finally {
    await prod.end();
  }
}

async function prepareSeparateDatabase() {
  const admin = await connectAdmin();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DATABASE]);
    if (!existing.rowCount) await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  } finally {
    await admin.end();
  }

  let test = await connect(TEST_DATABASE);
  let count = await tableCount(test, 'public');
  if (count > 0 && count < 40) {
    await test.end();
    const adminReset = await connectAdmin();
    await adminReset.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE]
    );
    await adminReset.query(`DROP DATABASE "${TEST_DATABASE}"`);
    await adminReset.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    await adminReset.end();
    count = 0;
  } else {
    await test.end();
  }
  if (count < 40) applyDump(TEST_DATABASE, dumpSchemaFile());
  test = await connect(TEST_DATABASE);
  try {
    await seedReference(test);
  } finally {
    await test.end();
  }
  writeMode('database');
}

async function prepareTestSchema() {
  const db = await connect(process.env.PGDATABASE);
  try {
    await db.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
    let count = await tableCount(db, TEST_SCHEMA);
    if (count > 0 && count < 40) {
      await db.query(`DROP SCHEMA ${TEST_SCHEMA} CASCADE`);
      await db.query(`CREATE SCHEMA ${TEST_SCHEMA}`);
      count = 0;
    }
    if (count < 40) {
      const copyFile = schemaCopySql(dumpSchemaFile());
      await db.end();
      applyDump(process.env.PGDATABASE, copyFile);
    } else {
      await db.end();
    }
  } catch (error) {
    await db.end().catch(() => {});
    throw error;
  }

  const test = await connect(process.env.PGDATABASE);
  try {
    await test.query(`SET search_path TO ${TEST_SCHEMA}, public`);
    await seedReference(test);
  } finally {
    await test.end();
  }
  writeMode('schema');
}

async function main() {
  throw new Error(
    'ensure-test-database.js is disabled. It loaded .env.migration and copied catalog rows from the team database. Use scripts/bootstrap-isolated-test-db.js with local TEST_PG* only.'
  );
}

if (require.main === module) {
  console.error(
    'DISABLED: this helper must not dump or copy BuilMate. Use npm run test:db:bootstrap after Docker or backend/.env.test.admin is set.'
  );
  process.exit(2);
}

module.exports = { TEST_DATABASE, main };
