#!/usr/bin/env node
/**
 * Diagnose public image URLs on BuilMate_test vs disk vs API :5055.
 * Does not print connection strings, tokens, or file bytes.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');
const { isBlockedPublicUpload } = require('../../src/utils/public-uploads');

loadTestEnv();

const uploadRoot = path.resolve(__dirname, '../../uploads');
const API = 'http://127.0.0.1:5055';

function collectUrls(value, bag) {
  if (!value) return;
  if (typeof value === 'string') {
    if (value.includes('/uploads/')) bag.add(value.split('?')[0]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, bag));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, bag));
  }
}

function diskPath(url) {
  const rel = String(url || '')
    .replace(/\\/g, '/')
    .replace(/^\/uploads\/?/i, '');
  return path.join(uploadRoot, rel);
}

async function probe(url) {
  const res = await fetch(`${API}${url}`, { method: 'HEAD' }).catch(() => null);
  if (!res) return { status: 0, type: 'fetch-failed' };
  return { status: res.status, type: res.headers.get('content-type') || '' };
}

async function main() {
  const pgUrl = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: pgUrl });
  await pg.connect();
  try {
    const who = await pg.query(
      `SELECT current_database() AS db, inet_server_addr()::text AS addr, inet_server_port() AS port`
    );
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('Refusing inspect outside BuilMate_test');

    const stores = await pg.query(`
      SELECT name, store_type, status, avatar_url, cover_image_url, logo_url
      FROM stores
      WHERE name ILIKE '%demo%' OR status = 'LIVE'
      ORDER BY id
    `);
    const materials = await pg.query(`
      SELECT m.name, m.sku, mi.file_url
      FROM materials m
      LEFT JOIN material_images mi ON mi.material_id = m.id
      WHERE m.sku IN ('E2E-TILE-01') OR m.name ILIKE '%cement%' OR m.name ILIKE '%demo%'
      ORDER BY m.id, mi.sort_order
    `);
    const services = await pg.query(`
      SELECT s.name, si.file_url
      FROM services s
      LEFT JOIN service_images si ON si.service_id = s.id
      ORDER BY s.id
      LIMIT 20
    `);
    const profiles = await pg.query(`
      SELECT business_name, portfolio_avatar_url, team_logo_url, workshop_url
      FROM contractor_profiles
    `);
    const docs = await pg.query(`
      SELECT document_type, file_url FROM contractor_documents LIMIT 20
    `).catch(() => ({ rows: [] }));
    const media = await pg.query(`
      SELECT file_url FROM contractor_portfolio_media LIMIT 20
    `).catch(() => ({ rows: [] }));
    const storeGallery = await pg.query(`
      SELECT file_url FROM store_gallery LIMIT 20
    `).catch(() => ({ rows: [] }));

    const urls = new Set();
    for (const row of stores.rows) {
      collectUrls(row.avatar_url, urls);
      collectUrls(row.cover_image_url, urls);
      collectUrls(row.logo_url, urls);
    }
    for (const row of materials.rows) collectUrls(row.file_url, urls);
    for (const row of services.rows) collectUrls(row.file_url, urls);
    for (const row of profiles.rows) {
      collectUrls(row.portfolio_avatar_url, urls);
      collectUrls(row.team_logo_url, urls);
      collectUrls(row.workshop_url, urls);
    }
    for (const row of docs.rows) collectUrls(row.file_url, urls);
    for (const row of media.rows) collectUrls(row.file_url, urls);
    for (const row of storeGallery.rows) collectUrls(row.file_url, urls);

    const details = [];
    for (const url of [...urls].sort()) {
      const file = diskPath(url);
      const blocked = isBlockedPublicUpload(url);
      const exists = fs.existsSync(file);
      const http = await probe(url);
      details.push({
        url,
        scope: url.split('/')[2] || '',
        blocked,
        diskExists: exists,
        http,
      });
    }

    console.log(
      JSON.stringify(
        {
          who: who.rows[0],
          uploadRootExists: fs.existsSync(uploadRoot),
          storePublic: stores.rows.map((row) => ({
            name: row.name,
            type: row.store_type,
            listing: row.status,
            avatar: row.avatar_url,
            cover: row.cover_image_url,
            logo: row.logo_url,
          })),
          materialImages: materials.rows,
          profiles: profiles.rows,
          documentTypes: docs.rows.map((row) => row.document_type),
          files: details,
        },
        null,
        2
      )
    );
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(String(error.message || error).replace(/:[^:@/]+@/g, ':***@'));
  process.exit(1);
});
