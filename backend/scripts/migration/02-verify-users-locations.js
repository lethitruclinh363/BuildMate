const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');

async function main() {
  let pg;
  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();

    const mongoUsers = await mongo.db.collection('users').countDocuments();
    const pgUsers = await pg.query(`
      SELECT COUNT(*)::int AS count
      FROM public.users
      WHERE legacy_mongo_id IS NOT NULL
    `);

    const mongoByRole = await mongo.db.collection('users').aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();

    const pgByRole = await pg.query(`
      SELECT r.code AS role, COUNT(*)::int AS count
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      WHERE u.legacy_mongo_id IS NOT NULL
      GROUP BY r.code
      ORDER BY r.code
    `);

    const missingRole = await pg.query(`
      SELECT u.id, u.legacy_mongo_id
      FROM public.users u
      LEFT JOIN public.roles r ON r.id = u.role_id
      WHERE u.legacy_mongo_id IS NOT NULL AND r.id IS NULL
      LIMIT 20
    `);

    const invalidLocation = await pg.query(`
      SELECT u.id, u.legacy_mongo_id, u.location_id
      FROM public.users u
      LEFT JOIN public.locations l ON l.id = u.location_id
      WHERE u.legacy_mongo_id IS NOT NULL
        AND u.location_id IS NOT NULL
        AND l.id IS NULL
      LIMIT 20
    `);

    const duplicateLegacy = await pg.query(`
      SELECT legacy_mongo_id, COUNT(*)::int AS count
      FROM public.users
      WHERE legacy_mongo_id IS NOT NULL
      GROUP BY legacy_mongo_id
      HAVING COUNT(*) > 1
    `);

    const duplicateEmail = await pg.query(`
      SELECT LOWER(email) AS email, COUNT(*)::int AS count
      FROM public.users
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    `);

    const missingPassword = await pg.query(`
      SELECT COUNT(*)::int AS count
      FROM public.users
      WHERE legacy_mongo_id IS NOT NULL
        AND (password_hash IS NULL OR password_hash = '' OR password_hash NOT LIKE '$2%')
    `);

    const workerRole = await pg.query(`
      SELECT COUNT(*)::int AS count
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      WHERE r.code = 'WORKER'
    `);

    const locations = await pg.query(`
      SELECT COUNT(*)::int AS count
      FROM public.users
      WHERE legacy_mongo_id IS NOT NULL AND location_id IS NOT NULL
    `);

    const mongoRoleMap = Object.fromEntries(mongoByRole.map((r) => [r._id, r.count]));
    const pgRoleMap = Object.fromEntries(pgByRole.rows.map((r) => [r.role, r.count]));

    console.log('\n=== Phase-1 verification ===');
    console.log(`Mongo users:      ${mongoUsers}`);
    console.log(`PostgreSQL users: ${pgUsers.rows[0].count}`);
    console.log('Mongo users by role:', mongoRoleMap);
    console.log('PG users by role:   ', pgRoleMap);
    console.log(`Broken role FKs:     ${missingRole.rowCount}`);
    console.log(`Broken location FKs: ${invalidLocation.rowCount}`);
    console.log(`Duplicate legacy IDs:${duplicateLegacy.rowCount}`);
    console.log(`Duplicate emails:    ${duplicateEmail.rowCount}`);
    console.log(`Missing password:    ${missingPassword.rows[0].count}`);
    console.log(`WORKER users:        ${workerRole.rows[0].count}`);
    console.log(`Users with location: ${locations.rows[0].count}`);

    const failures = [];
    if (mongoUsers !== pgUsers.rows[0].count) failures.push('Mongo/PostgreSQL user counts differ');
    if (JSON.stringify(mongoRoleMap) !== JSON.stringify(pgRoleMap)) failures.push('Role counts differ');
    if (missingRole.rowCount) failures.push('Broken role foreign keys found');
    if (invalidLocation.rowCount) failures.push('Broken location foreign keys found');
    if (duplicateLegacy.rowCount) failures.push('Duplicate legacy_mongo_id found');
    if (duplicateEmail.rowCount) failures.push('Duplicate email found');
    if (missingPassword.rows[0].count) failures.push('Users missing a bcrypt password_hash');
    if (workerRole.rows[0].count) failures.push('WORKER role is present');

    if (failures.length) {
      throw new Error(failures.join('; '));
    }

    console.log('Verification PASSED. Phase 1 is ready for the next migration group.');
  } finally {
    await closeConnections(pg);
  }
}

main().catch((err) => {
  console.error('\nVerification FAILED:', err.message);
  process.exitCode = 1;
});
