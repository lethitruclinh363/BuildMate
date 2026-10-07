/**
 * Insert MongoDB users that are not already in PostgreSQL.
 * Existing PostgreSQL rows are never updated or deleted.
 * A collision that could overwrite a PostgreSQL-only account aborts before COMMIT.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');

const ALLOWED_ROLES = new Set(['ADMIN', 'CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER']);
const ALLOWED_PROFILE_STATUS = new Set(['INCOMPLETE', 'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']);
const ALLOWED_ACCOUNT_STATUS = new Set(['PENDING_EMAIL', 'ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'BLOCKED', 'INACTIVE', 'PENDING_VERIFICATION', 'BANNED']);
const ALLOWED_LANG = new Set(['vi', 'en']);
const FIXTURES = [
  { role: 'CUSTOMER', email: 'oscar.d@example.net', password: 'Demo@1234', portal: 'public' },
  { role: 'CONTRACTOR', email: 'paula.r@example.org', password: 'Demo@1234', portal: 'public' },
  { role: 'MATERIAL_STORE_OWNER', email: 'yosef.c@example.com', password: 'Demo@1234', portal: 'public' },
  { role: 'ADMIN', email: 'ivan.p@example.net', password: 'Admin@1234', portal: 'admin' },
];

function str(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function dateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function intOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function extractCoordinates(doc) {
  const coords = doc?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function normalizeUser(doc) {
  const mongoId = String(doc._id || '');
  const phone = str(doc.phoneNumber) || str(doc.phone) || null;
  const preferredLanguage = doc.preferredLanguage == null || doc.preferredLanguage === ''
    ? null
    : String(doc.preferredLanguage);
  return {
    mongoId,
    fullName: str(doc.fullName) || str(doc.name),
    email: str(doc.email),
    emailKey: str(doc.email).toLowerCase(),
    passwordHash: doc.password == null ? '' : String(doc.password),
    role: str(doc.role),
    phone,
    acceptedPolicy: Boolean(doc.acceptedPolicy),
    acceptedPolicyVersion: str(doc.acceptedPolicyVersion),
    acceptedPolicyAt: dateOrNull(doc.acceptedPolicyAt),
    profileStatus: doc.profileStatus == null || doc.profileStatus === '' ? 'INCOMPLETE' : String(doc.profileStatus),
    tokenVersion: intOr(doc.tokenVersion, 0),
    avatarUrl: str(doc.avatar),
    accountStatus: doc.status == null || doc.status === '' ? 'PENDING_EMAIL' : String(doc.status),
    emailVerified: Boolean(doc.emailVerified),
    verificationCode: str(doc.verificationCode),
    verificationAttempts: intOr(doc.verificationAttempts, 0),
    verificationSentAt: dateOrNull(doc.verificationSentAt),
    verificationExpiresAt: dateOrNull(doc.verificationExpire),
    resetPasswordToken: str(doc.resetPasswordToken),
    resetPasswordAttempts: intOr(doc.resetPasswordAttempts, 0),
    resetPasswordSentAt: dateOrNull(doc.resetPasswordSentAt),
    resetPasswordExpiresAt: dateOrNull(doc.resetPasswordExpire),
    refreshToken: str(doc.refreshToken),
    preferredLanguage,
    createdAt: dateOrNull(doc.createdAt) || new Date(),
    updatedAt: dateOrNull(doc.updatedAt) || dateOrNull(doc.createdAt) || new Date(),
    coordinates: extractCoordinates(doc),
  };
}

function fingerprint(row) {
  return [
    row.legacy_mongo_id || '',
    row.email || '',
    row.phone_number || '',
    row.full_name || '',
    row.password_hash || '',
    row.account_status || '',
    String(row.token_version),
  ].join('|');
}

function collision(mongoUser, postgresRow, match) {
  return {
    match,
    mongo_id: mongoUser.mongoId,
    mongo_role: mongoUser.role,
    mongo_email: mongoUser.email,
    postgres_id: String(postgresRow.id),
    postgres_legacy_mongo_id: postgresRow.legacy_mongo_id,
    postgres_email: postgresRow.email,
  };
}

async function insertLocation(pg, user) {
  const existing = await pg.query(
    `SELECT id
     FROM public.locations
     WHERE latitude = $1::numeric
       AND longitude = $2::numeric
       AND location_source = 'legacy_mongo'
     ORDER BY id
     LIMIT 1`,
    [user.coordinates.lat, user.coordinates.lng]
  );
  if (existing.rowCount) return existing.rows[0].id;
  const created = await pg.query(
    `INSERT INTO public.locations (
       latitude, longitude, location_source, is_confirmed, created_at, updated_at
     ) VALUES ($1, $2, 'legacy_mongo', FALSE, $3, $4)
     RETURNING id`,
    [user.coordinates.lat, user.coordinates.lng, user.createdAt, user.updatedAt]
  );
  return created.rows[0].id;
}

async function insertUser(pg, user, roleId, locationId) {
  await pg.query(
    `INSERT INTO public.users (
      legacy_mongo_id, role_id, location_id, full_name, email, phone_number,
      password_hash, accepted_policy, accepted_policy_version, accepted_policy_at,
      profile_status, token_version, avatar_url, account_status, email_verified,
      verification_code, verification_attempts, verification_sent_at, verification_expires_at,
      reset_password_token, reset_password_attempts, reset_password_sent_at, reset_password_expires_at,
      refresh_token, preferred_language, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
    )`,
    [
      user.mongoId,
      roleId,
      locationId,
      user.fullName,
      user.email,
      user.phone,
      user.passwordHash,
      user.acceptedPolicy,
      user.acceptedPolicyVersion,
      user.acceptedPolicyAt,
      user.profileStatus,
      user.tokenVersion,
      user.avatarUrl,
      user.accountStatus,
      user.emailVerified,
      user.verificationCode,
      user.verificationAttempts,
      user.verificationSentAt,
      user.verificationExpiresAt,
      user.resetPasswordToken,
      user.resetPasswordAttempts,
      user.resetPasswordSentAt,
      user.resetPasswordExpiresAt,
      user.refreshToken,
      user.preferredLanguage,
      user.createdAt,
      user.updatedAt,
    ]
  );
}

async function verify(pg, mongoIds) {
  const checks = {};
  const missing = await pg.query(
    `SELECT COUNT(*)::int AS count
     FROM unnest($1::text[]) AS mongo_id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.users u WHERE u.legacy_mongo_id = mongo_id
     )`,
    [mongoIds]
  );
  checks.missing_legacy_users = missing.rows[0].count;

  const duplicateLegacy = await pg.query(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT legacy_mongo_id
       FROM public.users
       WHERE legacy_mongo_id IS NOT NULL
       GROUP BY legacy_mongo_id
       HAVING COUNT(*) > 1
     ) d`
  );
  checks.duplicate_legacy_mongo_id = duplicateLegacy.rows[0].count;

  const duplicateEmail = await pg.query(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT LOWER(email)
       FROM public.users
       GROUP BY LOWER(email)
       HAVING COUNT(*) > 1
     ) d`
  );
  checks.duplicate_email = duplicateEmail.rows[0].count;

  const brokenRole = await pg.query(
    `SELECT COUNT(*)::int AS count
     FROM public.users u
     LEFT JOIN public.roles r ON r.id = u.role_id
     WHERE r.id IS NULL`
  );
  checks.broken_role_fk = brokenRole.rows[0].count;

  const brokenLocation = await pg.query(
    `SELECT COUNT(*)::int AS count
     FROM public.users u
     LEFT JOIN public.locations l ON l.id = u.location_id
     WHERE u.location_id IS NOT NULL AND l.id IS NULL`
  );
  checks.broken_location_fk = brokenLocation.rows[0].count;

  const missingPassword = await pg.query(
    `SELECT COUNT(*)::int AS count
     FROM public.users
     WHERE password_hash IS NULL OR password_hash = '' OR password_hash NOT LIKE '$2%'`
  );
  checks.missing_password_hash = missingPassword.rows[0].count;

  const worker = await pg.query(
    `SELECT COUNT(*)::int AS count
     FROM public.users u
     JOIN public.roles r ON r.id = u.role_id
     WHERE r.code = 'WORKER'`
  );
  checks.worker_role = worker.rows[0].count;

  checks.pass = Object.values(checks).every((value) => value === 0);
  return checks;
}

async function loginLegacyUsers(users) {
  process.env.DATABASE_PROVIDER = 'postgres';
  const authService = require('../../src/services/authService');
  const adminAuth = require('../../src/services/adminAuthService');
  const results = [];

  for (const fixture of FIXTURES) {
    const sameRole = users.filter((user) => user.role === fixture.role);
    const known = sameRole.find((user) => user.emailKey === fixture.email.toLowerCase());
    let target = null;
    if (known && await bcrypt.compare(fixture.password, known.passwordHash)) {
      target = known;
    } else if (!known) {
      for (const user of sameRole) {
        if (await bcrypt.compare(fixture.password, user.passwordHash)) {
          target = user;
          break;
        }
      }
    }

    if (!target) {
      results.push({
        role: fixture.role,
        pass: false,
        detail: known
          ? 'known demo account exists but fixture password does not match; password was not reset'
          : 'no legacy account of this role matches the fixture password',
      });
      continue;
    }

    try {
      const session = fixture.portal === 'admin'
        ? await adminAuth.login({ email: target.email, password: fixture.password })
        : await authService.login({ email: target.email, password: fixture.password });
      results.push({
        role: fixture.role,
        email: target.email,
        pass: Boolean(session.token) && session.user.role === fixture.role,
        detail: 'fixture password accepted',
      });
    } catch (error) {
      results.push({
        role: fixture.role,
        email: target.email,
        pass: false,
        detail: `status ${error.statusCode || 'none'}: ${error.message}`,
      });
    }
  }

  return {
    pass: results.every((item) => item.pass),
    results,
  };
}

function writeReport(report) {
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'user-backfill-report.json'), JSON.stringify(report, null, 2));
}

async function main() {
  let pg;
  const report = {
    generated_at: new Date().toISOString(),
    committed: false,
    mongo_user_count: 0,
    postgres_before: 0,
    inserted: 0,
    already_mapped: 0,
    postgres_only: 0,
    collisions: [],
    invalid_roles: [],
    blocked: [],
    duplicate_phones: [],
    postgres_after: 0,
  };

  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();

    const rawUsers = await mongo.db.collection('users').find({}).sort({ _id: 1 }).toArray();
    const users = rawUsers.map(normalizeUser);
    const pgUsers = (await pg.query(
      `SELECT id, legacy_mongo_id, email, phone_number, full_name, password_hash, account_status, token_version
       FROM public.users
       ORDER BY id`
    )).rows;
    const roleRows = (await pg.query(`SELECT id, code FROM public.roles`)).rows;
    const roleIdByCode = new Map(roleRows.map((row) => [row.code, row.id]));

    const pgByLegacy = new Map(pgUsers.filter((row) => row.legacy_mongo_id).map((row) => [row.legacy_mongo_id, row]));
    const pgByEmail = new Map(pgUsers.map((row) => [String(row.email || '').toLowerCase(), row]));
    const pgByPhone = new Map(pgUsers.filter((row) => row.phone_number).map((row) => [row.phone_number, row]));
    const mongoIds = new Set(users.map((user) => user.mongoId));

    const alreadyMapped = [];
    const toInsert = [];
    const seenEmails = new Map();
    const seenPhones = new Map();

    for (const user of users) {
      const mapped = pgByLegacy.get(user.mongoId);
      if (mapped) {
        alreadyMapped.push(user.mongoId);
        continue;
      }

      const emailRow = user.emailKey ? pgByEmail.get(user.emailKey) : null;
      if (emailRow && emailRow.legacy_mongo_id !== user.mongoId) {
        report.collisions.push(collision(user, emailRow, 'email'));
        continue;
      }
      const phoneRow = user.phone ? pgByPhone.get(user.phone) : null;
      if (phoneRow && phoneRow.legacy_mongo_id !== user.mongoId) {
        report.collisions.push(collision(user, phoneRow, 'phone'));
        continue;
      }

      if (user.role === 'WORKER' || !ALLOWED_ROLES.has(user.role)) {
        report.invalid_roles.push({ mongo_id: user.mongoId, role: user.role || '' });
        continue;
      }

      const problems = [];
      if (!/^[0-9a-fA-F]{24}$/.test(user.mongoId)) problems.push('invalid Mongo ObjectId');
      if (!user.fullName || user.fullName.length > 80) problems.push('full_name missing or longer than 80');
      if (!user.email || user.email.length > 255) problems.push('email missing or longer than 255');
      if (user.phone && user.phone.length > 30) problems.push('phone longer than 30');
      if (!user.passwordHash.startsWith('$2')) problems.push('password is not a bcrypt hash');
      if (!ALLOWED_PROFILE_STATUS.has(user.profileStatus)) problems.push(`profile status ${user.profileStatus}`);
      if (!ALLOWED_ACCOUNT_STATUS.has(user.accountStatus)) problems.push(`account status ${user.accountStatus}`);
      if (user.preferredLanguage && !ALLOWED_LANG.has(user.preferredLanguage)) problems.push(`language ${user.preferredLanguage}`);
      if (user.acceptedPolicyVersion.length > 255) problems.push('policy version longer than 255');
      if (!roleIdByCode.has(user.role)) problems.push(`PostgreSQL role missing: ${user.role}`);
      const previousEmail = seenEmails.get(user.emailKey);
      if (previousEmail) problems.push(`duplicate Mongo email with ${previousEmail}`);
      else if (user.emailKey) seenEmails.set(user.emailKey, user.mongoId);
      if (user.phone) {
        const previousPhone = seenPhones.get(user.phone);
        if (previousPhone) {
          report.duplicate_phones.push({
            mongo_id: user.mongoId,
            kept_on_mongo_id: previousPhone,
            phone: user.phone,
            action: 'same phone stays on the earlier Mongo user; this row is inserted with phone_number null because public.users allows that number once',
          });
          user.phone = null;
        } else {
          seenPhones.set(user.phone, user.mongoId);
        }
      }
      if (problems.length) {
        report.blocked.push({ mongo_id: user.mongoId, problems });
        continue;
      }
      toInsert.push(user);
    }

    const postgresOnly = pgUsers.filter((row) => !row.legacy_mongo_id || !mongoIds.has(row.legacy_mongo_id));
    const onlyFingerprints = new Map(postgresOnly.map((row) => [String(row.id), fingerprint(row)]));

    report.mongo_user_count = users.length;
    report.postgres_before = pgUsers.length;
    report.already_mapped = alreadyMapped.length;
    report.postgres_only = postgresOnly.length;
    report.postgres_after = pgUsers.length;

    const mustAbort = report.collisions.length || report.invalid_roles.length || report.blocked.length;
    if (mustAbort) {
      report.abort_reason = 'Collision, invalid role, or blocked source row. No INSERT was committed.';
      writeReport(report);
      console.log(`ABORT before COMMIT. collisions=${report.collisions.length} invalid_roles=${report.invalid_roles.length} blocked=${report.blocked.length}`);
      process.exitCode = 1;
      return;
    }

    await pg.query('BEGIN');
    for (const user of toInsert) {
      const locationId = user.coordinates ? await insertLocation(pg, user) : null;
      await insertUser(pg, user, roleIdByCode.get(user.role), locationId);
    }
    const after = await pg.query(`SELECT COUNT(*)::int AS count FROM public.users`);
    if (after.rows[0].count !== pgUsers.length + toInsert.length) {
      throw new Error('User count changed by an unexpected amount. Transaction will roll back.');
    }
    await pg.query('COMMIT');
    report.committed = true;
    report.inserted = toInsert.length;
    report.postgres_after = after.rows[0].count;

    const afterOnly = (await pg.query(
      `SELECT id, legacy_mongo_id, email, phone_number, full_name, password_hash, account_status, token_version
       FROM public.users
       WHERE id = ANY($1::bigint[])`,
      [postgresOnly.map((row) => row.id)]
    )).rows;
    report.postgres_only_unchanged = afterOnly.length === postgresOnly.length
      && afterOnly.every((row) => onlyFingerprints.get(String(row.id)) === fingerprint(row));

    report.verification = await verify(pg, users.map((user) => user.mongoId));
    report.login = await loginLegacyUsers(users);
    writeReport(report);

    console.log(`mongo_user_count=${report.mongo_user_count}`);
    console.log(`postgres_before=${report.postgres_before}`);
    console.log(`inserted=${report.inserted}`);
    console.log(`already_mapped=${report.already_mapped}`);
    console.log(`postgres_only=${report.postgres_only}`);
    console.log(`postgres_after=${report.postgres_after}`);
    console.log(`collisions=${report.collisions.length}`);
    console.log(`postgres_only_unchanged=${report.postgres_only_unchanged}`);
    console.log(`verification=${report.verification.pass ? 'PASS' : 'FAIL'}`);
    for (const item of report.login.results) {
      console.log(`login ${item.role} ${item.pass ? 'PASS' : 'FAIL'} ${item.detail}`);
    }
    if (!report.verification.pass || !report.login.pass || !report.postgres_only_unchanged) process.exitCode = 1;
  } catch (error) {
    if (pg) {
      try { await pg.query('ROLLBACK'); } catch (_) {}
    }
    report.committed = false;
    report.abort_reason = error.message;
    writeReport(report);
    console.error(`BACKFILL FAILED: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closeConnections(pg);
  }
}

main();
