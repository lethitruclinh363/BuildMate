const path = require('path');
const mongoose = require('mongoose');
const { Client } = require('pg');

// Load the normal backend environment first (MONGODB_URI lives there),
// then overlay migration-only PostgreSQL variables.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.migration'), override: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function pgSslConfig() {
  if (!asBool(process.env.PGSSL, false)) return false;
  return {
    rejectUnauthorized: asBool(process.env.PGSSL_REJECT_UNAUTHORIZED, true),
  };
}

async function connectMongo() {
  const uri = required('MONGODB_URI');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: false });
  return mongoose.connection;
}

async function connectPostgres() {
  const client = new Client({
    host: required('PGHOST'),
    port: Number(process.env.PGPORT || 5432),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
    ssl: pgSslConfig(),
  });
  await client.connect();
  return client;
}

async function closeConnections(pg) {
  if (pg) await pg.end().catch(() => {});
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
}

module.exports = {
  connectMongo,
  connectPostgres,
  closeConnections,
  asBool,
};
