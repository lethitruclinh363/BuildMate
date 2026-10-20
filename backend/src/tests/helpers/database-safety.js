const path = require('path');

const BLOCKED_DATABASE_NAMES = new Set(['builmate', 'postgres', 'template0', 'template1']);
const MAINTENANCE_DATABASE_NAME = 'postgres';

function loadTestEnv() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.migration'), override: true });
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.test'), override: true });
}

function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '').split('?')[0]);
  } catch {
    return '';
  }
}

function isBlockedDatabaseName(name) {
  const value = String(name || '').toLowerCase();
  if (!value) return true;
  if (BLOCKED_DATABASE_NAMES.has(value)) return true;
  const productionName = String(process.env.PGDATABASE || 'BuilMate').toLowerCase();
  return value === productionName;
}

function isMaintenanceDatabaseName(name) {
  return String(name || '').toLowerCase() === MAINTENANCE_DATABASE_NAME;
}

function hostName(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isLocalTestHost(host) {
  const value = String(host || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function isolatedTestDatabaseUrl() {
  const url = String(process.env.TEST_DATABASE_URL || '').trim();
  if (!url) return '';
  const name = databaseName(url);
  if (isBlockedDatabaseName(name)) return '';
  if (!isLocalTestHost(hostName(url)) && process.env.TEST_ALLOW_REMOTE !== 'yes') return '';
  return url;
}

function isolationError() {
  return new Error(
    'Integration tests require TEST_DATABASE_URL pointing at a PostgreSQL database other than BuilMate. Refusing to fall back to DATABASE_URL or PGDATABASE. Ask an admin to CREATE DATABASE "BuilMate_test", then put that URL in backend/.env.test.'
  );
}

function requireIsolatedTestDatabase() {
  const url = isolatedTestDatabaseUrl();
  if (!url) throw isolationError();
  return url;
}

function isIsolatedTestDatabase() {
  return Boolean(isolatedTestDatabaseUrl()) && process.env.BUILDMATE_TEST_DATABASE === 'isolated';
}

module.exports = {
  BLOCKED_DATABASE_NAMES,
  MAINTENANCE_DATABASE_NAME,
  loadTestEnv,
  databaseName,
  isBlockedDatabaseName,
  isMaintenanceDatabaseName,
  isolatedTestDatabaseUrl,
  requireIsolatedTestDatabase,
  isIsolatedTestDatabase,
  isolationError,
  hostName,
  isLocalTestHost,
};
