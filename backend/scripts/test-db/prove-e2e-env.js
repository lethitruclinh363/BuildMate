#!/usr/bin/env node
/**
 * Read-only proof that the Phase 7 browser stack can bind to BuilMate_test.
 * Never prints passwords or full connection strings.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const {
  loadTestEnv,
  requireIsolatedTestDatabase,
  databaseName,
  hostName,
  isBlockedDatabaseName,
} = require('../../src/tests/helpers/database-safety');

function redactUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : ''),
      pathname: url.pathname,
      database: decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0] || ''),
    };
  } catch {
    return { parseError: true };
  }
}

function readEnvFile(rel) {
  const full = path.resolve(__dirname, '../../..', rel);
  if (!fs.existsSync(full)) return { path: rel, exists: false };
  const text = fs.readFileSync(full, 'utf8');
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return { path: rel, exists: true, keys: Object.keys(values), values };
}

function probePort(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 800 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
    return { ok: res.ok, status: res.status, json };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

function gitTracked(rel) {
  const root = path.resolve(__dirname, '../../..');
  const result = spawnSync('git', ['ls-files', '--error-unmatch', rel], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0;
}

async function main() {
  loadTestEnv();
  const docker = readEnvFile('backend/.env.test.docker');
  const testEnv = readEnvFile('backend/.env.test');
  const appEnv = readEnvFile('backend/.env');
  const frontendEnv = readEnvFile('frontend/.env');
  const adminEnv = readEnvFile('admin/.env');

  let isolated = '';
  let isolatedError = '';
  try {
    isolated = requireIsolatedTestDatabase();
  } catch (error) {
    isolatedError = error.message;
  }

  const dockerInspect = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}|{{.State.Status}}', 'buildmate-test-pg'], {
    encoding: 'utf8',
  });

  const ports = {};
  for (const [name, host, port] of [
    ['pg18', '127.0.0.1', 5432],
    ['testPg', '127.0.0.1', 55432],
    ['backend5000', '127.0.0.1', 5000],
    ['frontend5173', '127.0.0.1', 5173],
    ['admin5174', '127.0.0.1', 5174],
    ['backend5055', '127.0.0.1', 5055],
    ['frontend5176', '127.0.0.1', 5176],
    ['admin5177', '127.0.0.1', 5177],
  ]) {
    ports[name] = await probePort(host, port);
  }

  let pg = null;
  if (isolated) {
    const client = new Client({ connectionString: isolated });
    await client.connect();
    try {
      const who = await client.query('SELECT current_database() AS db, inet_server_addr()::text AS addr, inet_server_port() AS port');
      const indexes = await client.query(`
        SELECT i.relname AS indexname, ix.indisunique AS is_unique, ix.indisvalid AS is_valid
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'users'
          AND i.relname IN ('uq_users_email_lower', 'uq_users_phone_number_nonempty')
      `);
      const actors = await client.query(`
        SELECT r.code AS role, count(*)::int AS n
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.email LIKE '%@buildmate.test'
        GROUP BY r.code
        ORDER BY r.code
      `);
      pg = {
        database: who.rows[0].db,
        port: who.rows[0].port,
        indexes: indexes.rows,
        actors: actors.rows,
      };
    } finally {
      await client.end();
    }
  }

  const report = {
    isolatedTestUrl: isolated ? redactUrl(isolated) : { missing: true, error: isolatedError },
    isolatedBlocked: isolated ? isBlockedDatabaseName(databaseName(isolated)) : true,
    isolatedHost: isolated ? hostName(isolated) : '',
    dockerContainer: dockerInspect.status === 0 ? dockerInspect.stdout.trim() : `docker inspect failed: ${dockerInspect.stderr || dockerInspect.error?.message}`,
    ports,
    envFiles: {
      'backend/.env.test': {
        exists: testEnv.exists,
        gitTracked: gitTracked('backend/.env.test'),
        testDatabase: testEnv.values?.TEST_DATABASE_URL ? redactUrl(testEnv.values.TEST_DATABASE_URL) : null,
      },
      'backend/.env': {
        exists: appEnv.exists,
        gitTracked: gitTracked('backend/.env'),
        databaseUrl: appEnv.values?.DATABASE_URL ? redactUrl(appEnv.values.DATABASE_URL) : null,
        port: appEnv.values?.PORT || '5000-default',
        smtpHost: Boolean(appEnv.values?.EMAIL_HOST || appEnv.values?.SMTP_HOST),
      },
      'frontend/.env': {
        exists: frontendEnv.exists,
        gitTracked: gitTracked('frontend/.env'),
        viteApi: frontendEnv.values?.VITE_API_URL || null,
      },
      'admin/.env': {
        exists: adminEnv.exists,
        gitTracked: gitTracked('admin/.env'),
        viteApi: adminEnv.values?.VITE_API_URL || adminEnv.values?.VITE_API_BASE_URL || null,
      },
      'backend/.env.test.docker': {
        exists: docker.exists,
        gitTracked: gitTracked('backend/.env.test.docker'),
        host: docker.values?.TEST_PGHOST || null,
        port: docker.values?.TEST_PGPORT || null,
        db: docker.values?.TEST_PGDATABASE || 'compose POSTGRES_DB',
      },
    },
    pg,
    health5000: ports.backend5000 ? await fetchJson('http://127.0.0.1:5000/api/health') : { skipped: true },
    health5055: ports.backend5055 ? await fetchJson('http://127.0.0.1:5055/api/health') : { skipped: true },
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
