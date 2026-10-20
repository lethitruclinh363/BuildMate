const path = require('path');
const { PrismaClient } = require('@prisma/client');

const isolatedUrl = process.env.TEST_DATABASE_URL && process.env.BUILDMATE_TEST_DATABASE === 'isolated'
  ? process.env.TEST_DATABASE_URL
  : '';

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.migration'), override: true });

if (isolatedUrl) {
  process.env.TEST_DATABASE_URL = isolatedUrl;
  process.env.DATABASE_URL = isolatedUrl;
  process.env.BUILDMATE_TEST_DATABASE = 'isolated';
} else if (process.env.TEST_DATABASE_URL && process.env.BUILDMATE_TEST_DATABASE === 'isolated') {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for PostgreSQL runtime`);
  return value;
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = encodeURIComponent(required('PGUSER'));
  const password = encodeURIComponent(required('PGPASSWORD'));
  const host = required('PGHOST');
  const port = process.env.PGPORT || '5432';
  const database = encodeURIComponent(required('PGDATABASE'));
  const ssl = String(process.env.PGSSL || 'false').toLowerCase() === 'true' ? '?sslmode=require' : '';
  return `postgresql://${user}:${password}@${host}:${port}/${database}${ssl}`;
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl();
}

const { requestStats } = require('./requestStats');

function noteQuery(ms) {
  const stats = requestStats.getStore();
  if (!stats) return;
  stats.count += 1;
  stats.ms += ms;
}

function withQueryAudit(base) {
  if (process.env.NODE_ENV === 'production') return base;
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const start = performance.now();
          try {
            return await query(args);
          } finally {
            noteQuery(performance.now() - start);
          }
        },
      },
    },
  });
}

const prisma = global.__buildmatePrisma || withQueryAudit(new PrismaClient());
global.__buildmatePrisma = prisma;

module.exports = { prisma };
