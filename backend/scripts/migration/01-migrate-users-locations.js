const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections, asBool } = require('./lib/connections');

const ALLOWED_ROLES = new Set(['ADMIN', 'CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER']);
const ALLOWED_PROFILE_STATUS = new Set(['INCOMPLETE','DRAFT','SUBMITTED','PENDING_APPROVAL','APPROVED','REJECTED']);
const ALLOWED_ACCOUNT_STATUS = new Set(['PENDING_EMAIL','ACTIVE','PENDING_APPROVAL','REJECTED','BLOCKED','INACTIVE','PENDING_VERIFICATION','BANNED']);
const ALLOWED_LANG = new Set(['vi', 'en']);

function str(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function dateOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function intOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function extractCoordinates(doc) {
  const coords = doc?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Mongoose defaults User.location.coordinates to [0, 0]; treat it as unset.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function normalizeUser(doc, warnings) {
  const mongoId = String(doc._id || '');
  const fullNameRaw = str(doc.fullName);
  const nameRaw = str(doc.name);
  if (fullNameRaw && nameRaw && fullNameRaw !== nameRaw) {
    warnings.push(`${mongoId}: name and fullName differ; full_name uses fullName`);
  }
  const fullName = fullNameRaw || nameRaw;
  const email = str(doc.email);
  const passwordHash = doc.password == null ? '' : String(doc.password);
  const role = str(doc.role);
  const phoneRaw = str(doc.phone);
  const phoneNumberRaw = str(doc.phoneNumber);
  if (phoneRaw && phoneNumberRaw && phoneRaw !== phoneNumberRaw) {
    warnings.push(`${mongoId}: phone and phoneNumber differ`);
  }
  const phone = phoneNumberRaw || phoneRaw || null;
  const profileStatus = doc.profileStatus == null || doc.profileStatus === ''
    ? 'INCOMPLETE'
    : String(doc.profileStatus);
  const accountStatus = doc.status == null || doc.status === ''
    ? 'PENDING_EMAIL'
    : String(doc.status);
  const preferredLanguage = doc.preferredLanguage == null || doc.preferredLanguage === ''
    ? null
    : String(doc.preferredLanguage);

  return {
    mongoId,
    fullName,
    email,
    passwordHash,
    role,
    phone,
    acceptedPolicy: Boolean(doc.acceptedPolicy),
    acceptedPolicyVersion: str(doc.acceptedPolicyVersion),
    acceptedPolicyAt: dateOrNull(doc.acceptedPolicyAt),
    profileStatus,
    tokenVersion: intOr(doc.tokenVersion, 0),
    avatarUrl: str(doc.avatar),
    accountStatus,
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

function validateUsers(users) {
  const problems = [];
  const emails = new Map();
  const phones = new Map();

  for (const u of users) {
    if (!/^[0-9a-fA-F]{24}$/.test(u.mongoId)) problems.push(`${u.mongoId || '(missing _id)'}: invalid Mongo ObjectId`);
    if (!u.fullName) problems.push(`${u.mongoId}: missing fullName/name`);
    if (!u.email) problems.push(`${u.mongoId}: missing email`);
    if (!u.passwordHash) problems.push(`${u.mongoId}: missing password hash`);
    if (u.passwordHash && !u.passwordHash.startsWith('$2')) problems.push(`${u.mongoId}: password is not a bcrypt hash`);
    if (u.role === 'WORKER' || !ALLOWED_ROLES.has(u.role)) {
      problems.push(`${u.mongoId}: unsupported role ${u.role || '(empty)'}. Migration stopped. Role was not converted.`);
    }
    if (!ALLOWED_PROFILE_STATUS.has(u.profileStatus)) problems.push(`${u.mongoId}: unsupported profileStatus ${u.profileStatus}`);
    if (!ALLOWED_ACCOUNT_STATUS.has(u.accountStatus)) problems.push(`${u.mongoId}: unsupported status ${u.accountStatus}`);
    if (u.preferredLanguage && !ALLOWED_LANG.has(u.preferredLanguage)) {
      problems.push(`${u.mongoId}: unsupported preferredLanguage ${u.preferredLanguage}`);
    }
    if (u.warnings) problems.push(...u.warnings.filter((w) => w.includes('phone and phoneNumber differ')));

    if (u.email) {
      const key = u.email.toLowerCase();
      const previous = emails.get(key);
      if (previous) problems.push(`${u.mongoId}: duplicate email with ${previous}`);
      else emails.set(key, u.mongoId);
    }
    if (u.phone) {
      const previous = phones.get(u.phone);
      if (previous) problems.push(`${u.mongoId}: duplicate non-empty phone with ${previous}`);
      else phones.set(u.phone, u.mongoId);
    }
  }
  return problems;
}

async function main() {
  let pg;
  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();

    const rawUsers = await mongo.db.collection('users').find({}).sort({ _id: 1 }).toArray();
    const warnings = [];
    const users = rawUsers.map((doc) => {
      const userWarnings = [];
      const user = normalizeUser(doc, userWarnings);
      warnings.push(...userWarnings);
      user.warnings = userWarnings;
      return user;
    });
    const problems = validateUsers(users);

    if (problems.length) {
      console.error(`Source validation found ${problems.length} problem(s):`);
      for (const p of problems.slice(0, 50)) console.error(` - ${p}`);
      if (problems.length > 50) console.error(` ... ${problems.length - 50} more`);
      throw new Error('MongoDB users failed migration pre-validation. PostgreSQL was not changed.');
    }

    const existing = await pg.query(`SELECT COUNT(*)::int AS count FROM public.users WHERE legacy_mongo_id IS NOT NULL`);
    const allowNonempty = asBool(process.env.MIGRATION_ALLOW_NONEMPTY, false);
    if (existing.rows[0].count > 0 && !allowNonempty) {
      throw new Error(`PostgreSQL already contains ${existing.rows[0].count} migrated user(s). Set MIGRATION_ALLOW_NONEMPTY=true only if you intentionally want an upsert rerun.`);
    }

    const roleRows = await pg.query(`SELECT id, code FROM public.roles`);
    const roleIdByCode = new Map(roleRows.rows.map((r) => [r.code, r.id]));
    for (const role of ALLOWED_ROLES) {
      if (!roleIdByCode.has(role)) throw new Error(`PostgreSQL role seed missing: ${role}`);
    }

    console.log(`Migrating ${users.length} MongoDB user(s) into PostgreSQL...`);
    await pg.query('BEGIN');

    const idMap = {};
    let locationCount = 0;

    for (const u of users) {
      let locationId = null;

      const current = await pg.query(
        `SELECT id, location_id FROM public.users WHERE legacy_mongo_id = $1`,
        [u.mongoId]
      );

      if (u.coordinates) {
        if (current.rowCount && current.rows[0].location_id) {
          locationId = current.rows[0].location_id;
          await pg.query(`
            UPDATE public.locations
            SET latitude = $1, longitude = $2, updated_at = $3
            WHERE id = $4
          `, [u.coordinates.lat, u.coordinates.lng, u.updatedAt, locationId]);
        } else {
          const loc = await pg.query(`
            INSERT INTO public.locations (
              latitude, longitude, is_confirmed, created_at, updated_at
            ) VALUES ($1, $2, FALSE, $3, $4)
            RETURNING id
          `, [u.coordinates.lat, u.coordinates.lng, u.createdAt, u.updatedAt]);
          locationId = loc.rows[0].id;
          locationCount += 1;
        }
      }

      const result = await pg.query(`
        INSERT INTO public.users (
          legacy_mongo_id, role_id, location_id, full_name, email, phone_number,
          password_hash, accepted_policy, accepted_policy_version, accepted_policy_at,
          profile_status, token_version, avatar_url, account_status, email_verified,
          verification_code, verification_attempts, verification_sent_at, verification_expires_at,
          reset_password_token, reset_password_attempts, reset_password_sent_at, reset_password_expires_at,
          refresh_token, preferred_language, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
        )
        ON CONFLICT (legacy_mongo_id) DO UPDATE SET
          role_id = EXCLUDED.role_id,
          location_id = EXCLUDED.location_id,
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          phone_number = EXCLUDED.phone_number,
          password_hash = EXCLUDED.password_hash,
          accepted_policy = EXCLUDED.accepted_policy,
          accepted_policy_version = EXCLUDED.accepted_policy_version,
          accepted_policy_at = EXCLUDED.accepted_policy_at,
          profile_status = EXCLUDED.profile_status,
          token_version = EXCLUDED.token_version,
          avatar_url = EXCLUDED.avatar_url,
          account_status = EXCLUDED.account_status,
          email_verified = EXCLUDED.email_verified,
          verification_code = EXCLUDED.verification_code,
          verification_attempts = EXCLUDED.verification_attempts,
          verification_sent_at = EXCLUDED.verification_sent_at,
          verification_expires_at = EXCLUDED.verification_expires_at,
          reset_password_token = EXCLUDED.reset_password_token,
          reset_password_attempts = EXCLUDED.reset_password_attempts,
          reset_password_sent_at = EXCLUDED.reset_password_sent_at,
          reset_password_expires_at = EXCLUDED.reset_password_expires_at,
          refresh_token = EXCLUDED.refresh_token,
          preferred_language = EXCLUDED.preferred_language,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
        RETURNING id
      `, [
        u.mongoId,
        roleIdByCode.get(u.role),
        locationId,
        u.fullName,
        u.email,
        u.phone,
        u.passwordHash,
        u.acceptedPolicy,
        u.acceptedPolicyVersion,
        u.acceptedPolicyAt,
        u.profileStatus,
        u.tokenVersion,
        u.avatarUrl,
        u.accountStatus,
        u.emailVerified,
        u.verificationCode,
        u.verificationAttempts,
        u.verificationSentAt,
        u.verificationExpiresAt,
        u.resetPasswordToken,
        u.resetPasswordAttempts,
        u.resetPasswordSentAt,
        u.resetPasswordExpiresAt,
        u.refreshToken,
        u.preferredLanguage,
        u.createdAt,
        u.updatedAt,
      ]);

      idMap[u.mongoId] = String(result.rows[0].id);
    }

    await pg.query('COMMIT');

    const outputDir = path.resolve(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'users-map.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), users: idMap }, null, 2),
      'utf8'
    );

    if (warnings.length) {
      console.log(`Warnings (${warnings.length}):`);
      for (const warning of warnings) console.log(` - ${warning}`);
    }
    console.log(`Migration COMMITTED: users=${users.length}, locations migrated=${locationCount}`);
    console.log(`ID map written to scripts/migration/output/users-map.json`);
  } catch (err) {
    if (pg) {
      try { await pg.query('ROLLBACK'); } catch (_) {}
    }
    throw err;
  } finally {
    await closeConnections(pg);
  }
}

main().catch((err) => {
  console.error('\nPhase-1 migration FAILED:', err.message);
  process.exitCode = 1;
});
