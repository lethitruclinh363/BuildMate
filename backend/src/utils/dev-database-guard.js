const BLOCKED_NAMES = new Set(['builmate', 'builmate_test', 'postgres', 'template0', 'template1']);
const BLOCKED_PORTS = new Set(['5432', '55432']);

function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '').split('?')[0]);
  } catch {
    return '';
  }
}

function hostName(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function portOf(url) {
  try {
    return new URL(url).port || '5432';
  } catch {
    return '';
  }
}

function assertDevDatabaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) {
    throw new Error('Set DEV_DATABASE_URL to postgresql://…@127.0.0.1:55433/BuilMate_dev');
  }
  const name = databaseName(value);
  const host = hostName(value);
  const port = portOf(value);
  if (BLOCKED_NAMES.has(name.toLowerCase())) {
    throw new Error(`Refusing to migrate database "${name}"`);
  }
  if (BLOCKED_PORTS.has(port)) {
    throw new Error(`Refusing port ${port} (group or demo test)`);
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('DEV_DATABASE_URL must be local');
  }
  if (name !== 'BuilMate_dev') {
    throw new Error('DEV_DATABASE_URL database name must be BuilMate_dev');
  }
  if (port !== '55433') {
    throw new Error('DEV_DATABASE_URL port must be 55433');
  }
  return value;
}

module.exports = {
  BLOCKED_NAMES,
  BLOCKED_PORTS,
  databaseName,
  hostName,
  portOf,
  assertDevDatabaseUrl,
};
