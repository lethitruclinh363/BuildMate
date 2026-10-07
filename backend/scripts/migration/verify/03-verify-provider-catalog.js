const { connectMongo, connectPostgres, closeConnections } = require('../lib/connections');
const { loadPublicSchema } = require('../lib/schema');
const { ident, column } = require('../lib/rows');

const PARENTS = [
  ['contractorprofiles', 'contractor_profiles'],
  ['stores', 'stores'],
  ['catalogservices', 'catalog_services'],
  ['services', 'services'],
  ['servicesuggestions', 'service_suggestions'],
  ['materialcategories', 'material_categories'],
  ['materials', 'materials'],
  ['contractorekycverifications', 'contractor_ekyc_verifications'],
];

async function pgCount(pg, table, where = '') {
  const result = await pg.query(`SELECT COUNT(*)::int AS count FROM public.${ident(table)} ${where}`);
  return result.rows[0].count;
}

async function duplicates(pg, table) {
  const result = await pg.query(`
    SELECT legacy_mongo_id, COUNT(*)::int AS count
    FROM public.${ident(table)}
    WHERE legacy_mongo_id IS NOT NULL
    GROUP BY legacy_mongo_id
    HAVING COUNT(*) > 1
  `);
  return result.rowCount;
}

async function main() {
  let pg;
  const failures = [];
  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const schema = await loadPublicSchema(pg);
    console.log('\n=== Provider/catalog verification ===');

    for (const [collection, table] of PARENTS) {
      const mongoCount = await mongo.db.collection(collection).countDocuments();
      const postgresCount = await pgCount(pg, table, 'WHERE legacy_mongo_id IS NOT NULL');
      const dup = await duplicates(pg, table);
      console.log(`${collection} -> ${table}: mongo=${mongoCount} postgres=${postgresCount} duplicateLegacy=${dup}`);
      if (mongoCount !== postgresCount) failures.push(`${table} count mismatch`);
      if (dup) failures.push(`${table} duplicate legacy_mongo_id`);
    }

    const childTables = [
      'contractor_profile_steps',
      'contractor_documents',
      'contractor_service_areas',
      'contractor_profile_services',
      'contractor_material_categories',
      'contractor_portfolio_media',
      'contractor_portfolio_projects',
      'contractor_portfolio_project_images',
      'material_images',
      'ekyc_ocr_issues',
      'ekyc_liveness_frames',
      'ekyc_attempts',
    ];
    for (const table of childTables) {
      if (!schema[table]) {
        failures.push(`missing table ${table}`);
        continue;
      }
      console.log(`${table}: ${await pgCount(pg, table)}`);
    }
    for (const table of ['store_media', 'store_images', 'store_service_areas', 'service_images']) {
      if (schema[table]) console.log(`${table}: ${await pgCount(pg, table)}`);
    }

    const profiles = await mongo.db.collection('contractorprofiles').find({}).toArray();
    const expected = {
      contractor_profile_steps: 0,
      contractor_documents: 0,
      contractor_service_areas: 0,
      contractor_profile_services: 0,
      contractor_material_categories: 0,
      contractor_portfolio_projects: 0,
      contractor_portfolio_project_images: 0,
    };
    let media = 0;
    const avatarOnProfile = Boolean(column(schema, 'contractor_profiles', ['portfolio_avatar', 'avatar_url']));
    const logoOnProfile = Boolean(column(schema, 'contractor_profiles', ['portfolio_team_logo', 'team_logo_url']));
    const workshopOnProfile = Boolean(column(schema, 'contractor_profiles', ['portfolio_workshop', 'workshop_url']));
    for (const doc of profiles) {
      expected.contractor_profile_steps += (doc.completedSteps || []).length;
      expected.contractor_documents += (doc.documents || []).length;
      expected.contractor_service_areas += (doc.serviceAreas || []).filter((item) => String(item || '').trim()).length;
      expected.contractor_profile_services += (doc.services || []).length;
      expected.contractor_material_categories += (doc.materialCategories || []).length;
      expected.contractor_portfolio_projects += (doc.portfolio?.projects || []).length;
      for (const project of doc.portfolio?.projects || []) {
        expected.contractor_portfolio_project_images += (project.images || []).filter((item) => String(item || '').trim()).length;
      }
      const portfolio = doc.portfolio || {};
      if (!avatarOnProfile && String(portfolio.avatar || '').trim()) media += 1;
      if (!logoOnProfile && String(portfolio.teamLogo || '').trim()) media += 1;
      if (!workshopOnProfile && String(portfolio.workshop || '').trim()) media += 1;
      media += (portfolio.construction || []).filter((item) => String(item || '').trim()).length;
      media += (portfolio.certificates || []).filter((item) => String(item || '').trim()).length;
    }
    for (const [table, count] of Object.entries(expected)) {
      const actual = await pgCount(pg, table);
      console.log(`${table} expected=${count} actual=${actual}`);
      if (actual !== count) failures.push(`${table} child count mismatch`);
    }
    const mediaActual = await pgCount(pg, 'contractor_portfolio_media');
    console.log(`contractor_portfolio_media expected=${media} actual=${mediaActual}`);
    if (mediaActual !== media) failures.push('contractor_portfolio_media count mismatch');

    const fkQuery = await pg.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    `);
    const watched = new Set([
      ...PARENTS.map((item) => item[1]),
      ...childTables,
      'store_media',
      'store_images',
      'store_service_areas',
      'service_images',
      'service_categories',
      'users',
      'locations',
    ]);
    let orphans = 0;
    for (const fk of fkQuery.rows) {
      if (!watched.has(fk.table_name) || !schema[fk.table_name] || !schema[fk.foreign_table]) continue;
      const result = await pg.query(`
        SELECT COUNT(*)::int AS count
        FROM public.${ident(fk.table_name)} child
        LEFT JOIN public.${ident(fk.foreign_table)} parent
          ON parent.${ident(fk.foreign_column)} = child.${ident(fk.column_name)}
        WHERE child.${ident(fk.column_name)} IS NOT NULL AND parent.${ident(fk.foreign_column)} IS NULL
      `);
      if (result.rows[0].count) {
        orphans += result.rows[0].count;
        console.log(`orphan ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table}: ${result.rows[0].count}`);
      }
    }
    console.log(`orphan FK rows: ${orphans}`);
    if (orphans) failures.push('orphan foreign keys');

    const worker = await pg.query(`SELECT COUNT(*)::int AS count FROM public.roles WHERE code = 'WORKER'`);
    console.log(`WORKER roles: ${worker.rows[0].count}`);
    if (worker.rows[0].count) failures.push('WORKER role exists');
    for (const table of ['worker_profiles', 'contractor_workers']) {
      if (!schema[table]) continue;
      const count = await pgCount(pg, table);
      console.log(`${table}: ${count}`);
      if (count) failures.push(`${table} has rows; this phase must not create workers`);
    }

    if (failures.length) throw new Error(failures.join('; '));
    console.log('Verification PASSED. Provider/catalog group matches MongoDB.');
  } finally {
    await closeConnections(pg);
  }
}

main().catch((err) => {
  console.error('\nVerification FAILED:', err.message);
  process.exitCode = 1;
});
