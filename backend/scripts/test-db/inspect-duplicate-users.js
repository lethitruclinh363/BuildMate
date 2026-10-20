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
    const db = await client.query('SELECT current_database() AS db');
    const users = await client.query(`
      SELECT u.id, u.legacy_mongo_id, u.email, u.phone_number, u.account_status, r.code AS role, u.created_at
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE lower(u.email) IN (
        SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1
      )
      ORDER BY lower(u.email), u.id
    `);
    const fks = await client.query(`
      SELECT conrelid::regclass::text AS src, a.attname AS col
      FROM pg_constraint co
      JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = ANY (co.conkey)
      WHERE co.confrelid = 'users'::regclass AND co.contype = 'f'
      ORDER BY 1, 2
    `);
    const ids = users.rows.map((row) => row.id);
    const fkTotals = {};
    const fkPerUser = {};
    for (const row of fks.rows) {
      const key = `${row.src}.${row.col}`;
      const total = await client.query(
        `SELECT count(*)::int AS n FROM ${row.src} WHERE ${row.col} = ANY($1::bigint[])`,
        [ids]
      );
      fkTotals[key] = total.rows[0].n;
      const per = await client.query(
        `SELECT ${row.col}::text AS uid, count(*)::int AS n
         FROM ${row.src}
         WHERE ${row.col} = ANY($1::bigint[])
         GROUP BY 1`,
        [ids]
      );
      if (per.rowCount) fkPerUser[key] = per.rows;
    }
    console.log(JSON.stringify({
      database: db.rows[0].db,
      users: users.rows,
      fkTotals,
      fkPerUser,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(redact(error.message || error));
  process.exit(1);
});
