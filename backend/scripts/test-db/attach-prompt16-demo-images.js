#!/usr/bin/env node
/**
 * Attach harmless placeholder images to demo materials on BuilMate_test only.
 */
const { Client } = require('pg');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');
const { ensureE2ePlaceholderFile, RELATIVE_URL } = require('./ensure-e2e-placeholder');

loadTestEnv();

async function main() {
  ensureE2ePlaceholderFile();
  const url = requireIsolatedTestDatabase();
  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    const who = await pg.query('SELECT current_database() AS db');
    if (who.rows[0].db !== 'BuilMate_test') throw new Error('Refusing image attach outside BuilMate_test');
    const inserted = await pg.query(
      `
      INSERT INTO material_images (material_id, file_url, sort_order)
      SELECT m.id, $1, 0
      FROM materials m
      WHERE m.sku IN ('E2E-CEM-50', 'E2E-TILE-01')
        AND NOT EXISTS (
          SELECT 1 FROM material_images mi WHERE mi.material_id = m.id
        )
      RETURNING id, material_id, file_url
      `,
      [RELATIVE_URL]
    );
    const stores = await pg.query(
      `
      UPDATE stores
      SET avatar_url = CASE WHEN avatar_url = '' THEN $1 ELSE avatar_url END,
          cover_image_url = CASE WHEN cover_image_url = '' THEN $1 ELSE cover_image_url END
      WHERE name IN ('Demo Can Tho Crew', 'Demo Can Tho Materials')
      RETURNING name, avatar_url, cover_image_url
      `,
      [RELATIVE_URL]
    );
    console.log(
      JSON.stringify(
        {
          database: who.rows[0].db,
          materialImages: inserted.rows,
          stores: stores.rows,
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
