const { spawn } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const user = encodeURIComponent(required('PGUSER'));
const password = encodeURIComponent(required('PGPASSWORD'));
const host = required('PGHOST');
const port = process.env.PGPORT || '5432';
const database = encodeURIComponent(required('PGDATABASE'));
const ssl = String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? '?sslmode=require' : '';
const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${database}${ssl}`;

const prismaEntry = path.resolve(__dirname, '../../node_modules/prisma/build/index.js');
const child = spawn(process.execPath, [prismaEntry, 'db', 'pull'], {
  cwd: path.resolve(__dirname, '../..'),
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: ['ignore', 'inherit', 'inherit'],
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
