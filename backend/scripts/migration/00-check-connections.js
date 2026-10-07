const fs = require('fs');
const path = require('path');
const {
  MONGO_MODELS,
  REQUIRED_ROLES,
  REQUIRED_TABLES,
  EXPECTED_PUBLIC_TABLE_COUNT,
  EXPECTED_DATABASE,
  EXPECTED_SCHEMA,
} = require('./config/inventory');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');

const outputDir = path.resolve(__dirname, 'output');

function writeReport(report) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'preflight-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

function assertRealPostgresConfig() {
  const host = process.env.PGHOST || '';
  const user = process.env.PGUSER || '';
  const password = process.env.PGPASSWORD || '';
  const placeholders = ['your_postgresql_host', 'your_postgresql_user', 'your_postgresql_password', ''];
  if (placeholders.includes(host) || placeholders.includes(user) || placeholders.includes(password)) {
    throw new Error(
      'backend/.env.migration still has placeholder PostgreSQL credentials. Fill PGHOST, PGUSER, and PGPASSWORD locally. Do not commit that file.',
    );
  }
}

async function main() {
  let pg;
  const mismatches = [];
  try {
    const mongo = await connectMongo();
    const mongoPing = await mongo.db.admin().ping();
    console.log(`MongoDB: ${mongoPing?.ok === 1 ? 'OK' : 'FAIL'} (${mongo.name})`);

    assertRealPostgresConfig();
    pg = await connectPostgres();
    const mongoCollections = await mongo.db.listCollections().toArray();
    const collectionNames = new Set(mongoCollections.map((c) => c.name));
    const mongoCounts = {};
    for (const model of MONGO_MODELS) {
      mongoCounts[model.collection] = collectionNames.has(model.collection)
        ? await mongo.db.collection(model.collection).countDocuments()
        : null;
      if (!collectionNames.has(model.collection)) {
        mismatches.push(`Mongo collection missing for model ${model.model}: ${model.collection}`);
      }
    }

    const pgInfo = await pg.query(`
      SELECT current_database() AS database_name,
             current_user AS db_user,
             current_schema() AS current_schema
    `);
    const info = pgInfo.rows[0];
    if (info.database_name !== EXPECTED_DATABASE) {
      mismatches.push(`PostgreSQL database is "${info.database_name}", expected "${EXPECTED_DATABASE}"`);
    }
    if (info.current_schema !== EXPECTED_SCHEMA) {
      mismatches.push(`current_schema is "${info.current_schema}", expected "${EXPECTED_SCHEMA}"`);
    }

    const schemaExists = await pg.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [EXPECTED_SCHEMA],
    );
    if (!schemaExists.rowCount) mismatches.push(`Schema "${EXPECTED_SCHEMA}" does not exist`);

    const tableRows = await pg.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const publicTables = tableRows.rows.map((r) => r.table_name);
    const tableSet = new Set(publicTables);
    if (publicTables.length !== EXPECTED_PUBLIC_TABLE_COUNT) {
      mismatches.push(
        `public base table count is ${publicTables.length}, expected ${EXPECTED_PUBLIC_TABLE_COUNT}`,
      );
    }

    const missingTables = REQUIRED_TABLES.filter((name) => !tableSet.has(name));
    if (missingTables.length) {
      mismatches.push(`Required tables not found in public: ${missingTables.join(', ')}`);
    }

    const roles = await pg.query(`SELECT code FROM public.roles ORDER BY code`);
    const roleCodes = roles.rows.map((r) => r.code);
    const roleSet = new Set(roleCodes);
    const missingRoles = REQUIRED_ROLES.filter((code) => !roleSet.has(code));
    const extraRoles = roleCodes.filter((code) => !REQUIRED_ROLES.includes(code));
    if (missingRoles.length) mismatches.push(`Missing roles: ${missingRoles.join(', ')}`);
    if (extraRoles.length) mismatches.push(`Unexpected roles: ${extraRoles.join(', ')}`);
    if (roleSet.has('WORKER')) mismatches.push('WORKER role exists but was removed from BuildMate');

    const report = {
      checkedAt: new Date().toISOString(),
      writes: 'none',
      mongo: {
        ok: mongoPing?.ok === 1,
        database: mongo.name,
        models: MONGO_MODELS.length,
        counts: mongoCounts,
      },
      postgres: {
        ok: true,
        database: info.database_name,
        user: info.db_user,
        schema: info.current_schema,
        publicTableCount: publicTables.length,
        tables: publicTables,
        roles: roleCodes,
      },
      mismatches,
    };
    writeReport(report);

    console.log('\n=== BuildMate migration preflight ===');
    console.log(`PostgreSQL: OK (${info.database_name}), schema=${info.current_schema}, user=${info.db_user}`);
    console.log(`PostgreSQL public base tables: ${publicTables.length}`);
    console.log(`Roles: ${roleCodes.join(', ') || '(none)'}`);
    if (mismatches.length) {
      console.log('Mismatches:');
      for (const item of mismatches) console.log(`- ${item}`);
      throw new Error(`Preflight found ${mismatches.length} mismatch(es). No data was changed.`);
    }
    console.log('Preflight PASSED. No data was changed.');
  } finally {
    await closeConnections(pg);
  }
}

main().catch((err) => {
  console.error('\nPreflight FAILED:', err.message);
  process.exitCode = 1;
});
