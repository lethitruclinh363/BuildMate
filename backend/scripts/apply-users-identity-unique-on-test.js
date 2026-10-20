#!/usr/bin/env node
/**
 * Ensures login-identity UNIQUE indexes on TEST_DATABASE_URL only.
 * Never connects to BuilMate. Cleans only extra @buildmate.test fixture
 * rows that would block CREATE UNIQUE INDEX.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  loadTestEnv,
  requireIsolatedTestDatabase,
  databaseName,
  isBlockedDatabaseName,
} = require('../src/tests/helpers/database-safety');

loadTestEnv();

const EMAIL_INDEX = 'uq_users_email_lower';
const PHONE_INDEX = 'uq_users_phone_number_nonempty';

function indexRowsQuery() {
  return `
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
  `;
}

function emailIndexOk(row) {
  if (!row || !row.is_unique || !row.is_valid) return false;
  const def = String(row.indexdef || '').toLowerCase();
  return def.includes('unique') && /lower\s*\(\s*\(?email/.test(def);
}

function phoneIndexOk(row) {
  if (!row || !row.is_unique || !row.is_valid) return false;
  const def = String(row.indexdef || '').toLowerCase();
  return def.includes('unique')
    && def.includes('phone_number')
    && def.includes('where')
    && def.includes('is not null')
    && def.includes('btrim')
    && def.includes("<> ''");
}

async function listDuplicateEmails(client) {
  const result = await client.query(`
    SELECT lower(email) AS email, array_agg(id ORDER BY id) AS ids, count(*)::int AS n
    FROM users
    GROUP BY lower(email)
    HAVING count(*) > 1
    ORDER BY n DESC, lower(email)
  `);
  return result.rows;
}

async function cleanupFixtureEmailDuplicates(client, duplicates) {
  const foreign = duplicates.filter((row) => !String(row.email || '').endsWith('@buildmate.test'));
  if (foreign.length) {
    throw new Error(
      `Refusing to create ${EMAIL_INDEX}: non-fixture duplicate emails exist (${foreign.length} groups). Cleanup those rows manually on BuilMate_test only.`
    );
  }

  const extraIds = [];
  for (const row of duplicates) {
    const ids = row.ids.map((id) => String(id));
    extraIds.push(...ids.slice(1));
  }
  if (!extraIds.length) return { deleted: 0, kept: duplicates.map((row) => String(row.ids[0])) };

  await client.query('DELETE FROM contractor_profiles WHERE user_id = ANY($1::bigint[])', [extraIds]);
  await client.query(
    `DELETE FROM users
     WHERE id = ANY($1::bigint[])
       AND lower(email) LIKE '%@buildmate.test'`,
    [extraIds]
  );
  return { deleted: extraIds.length, kept: duplicates.map((row) => String(row.ids[0])) };
}

function assertRequiredIndexes(rows) {
  const byName = Object.fromEntries(rows.map((row) => [row.indexname, row]));
  if (!emailIndexOk(byName[EMAIL_INDEX])) {
    throw new Error(`Missing or invalid UNIQUE index ${EMAIL_INDEX} on BuilMate_test.users`);
  }
  if (!phoneIndexOk(byName[PHONE_INDEX])) {
    throw new Error(`Missing or invalid UNIQUE index ${PHONE_INDEX} on BuilMate_test.users`);
  }
}

async function main() {
  const url = requireIsolatedTestDatabase();
  const name = databaseName(url);
  if (isBlockedDatabaseName(name) || String(name).toLowerCase() === 'builmate') {
    throw new Error('Refusing to apply identity UNIQUE indexes on a blocked database');
  }

  const sqlPath = path.resolve(__dirname, 'sql/ensure-users-identity-unique.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const who = await client.query('SELECT current_database() AS db');
    if (String(who.rows[0].db).toLowerCase() !== 'builmate_test') {
      throw new Error(`Refusing identity UNIQUE SQL on ${who.rows[0].db}`);
    }

    const beforeIndexes = await client.query(indexRowsQuery());
    const beforeDupes = await listDuplicateEmails(client);
    let cleanup = { deleted: 0, kept: [] };
    if (beforeDupes.length) {
      cleanup = await cleanupFixtureEmailDuplicates(client, beforeDupes);
    }

    const remaining = await listDuplicateEmails(client);
    if (remaining.length) {
      throw new Error(`Cannot create identity UNIQUE indexes: ${remaining.length} duplicate email group(s) remain`);
    }

    await client.query(sql);
    const afterIndexes = await client.query(indexRowsQuery());
    assertRequiredIndexes(afterIndexes.rows);

    console.log(JSON.stringify({
      database: name,
      applied: path.basename(sqlPath),
      fixtureDuplicatesRemoved: cleanup.deleted,
      beforeIndexNames: beforeIndexes.rows.map((row) => row.indexname),
      afterIndexes: afterIndexes.rows
        .filter((row) => row.indexname === EMAIL_INDEX || row.indexname === PHONE_INDEX)
        .map((row) => ({
          indexname: row.indexname,
          is_unique: row.is_unique,
          is_valid: row.is_valid,
          indexdef: row.indexdef,
        })),
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
