const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/prisma');
const { normalizeEmail, storedVnMobile, phoneLookupValues } = require('../utils/identity');

const PROFILE_STATUS = Object.freeze({ INCOMPLETE: 'INCOMPLETE' });

const userSelect = {
  id: true,
  legacy_mongo_id: true,
  role_id: true,
  full_name: true,
  email: true,
  phone_number: true,
  password_hash: true,
  accepted_policy: true,
  accepted_policy_version: true,
  accepted_policy_at: true,
  profile_status: true,
  token_version: true,
  avatar_url: true,
  account_status: true,
  email_verified: true,
  verification_code: true,
  verification_attempts: true,
  verification_sent_at: true,
  verification_expires_at: true,
  reset_password_token: true,
  reset_password_attempts: true,
  reset_password_sent_at: true,
  reset_password_expires_at: true,
  preferred_language: true,
  created_at: true,
  updated_at: true,
  roles: { select: { code: true } },
};

function publicId(value) {
  return String(value || '');
}

function wherePublicId(id) {
  const value = publicId(id);
  if (/^[0-9a-f]{24}$/i.test(value)) return { legacy_mongo_id: value };
  if (/^\d+$/.test(value)) return { id: BigInt(value) };
  return { legacy_mongo_id: value };
}

class PgUser {
  constructor(row) {
    this.pgId = row.id;
    this._id = row.legacy_mongo_id;
    this.fullName = row.full_name;
    this.name = row.full_name;
    this.email = row.email;
    this.phone = row.phone_number || '';
    this.phoneNumber = row.phone_number || '';
    this.password = row.password_hash;
    this.acceptedPolicy = row.accepted_policy;
    this.acceptedPolicyVersion = row.accepted_policy_version || '';
    this.acceptedPolicyAt = row.accepted_policy_at;
    this.profileStatus = row.profile_status;
    this.tokenVersion = row.token_version;
    this.avatar = row.avatar_url || '';
    this.status = row.account_status;
    this.emailVerified = row.email_verified;
    this.verificationCode = row.verification_code || '';
    this.verificationAttempts = row.verification_attempts || 0;
    this.verificationSentAt = row.verification_sent_at;
    this.verificationExpire = row.verification_expires_at;
    this.resetPasswordToken = row.reset_password_token || '';
    this.resetPasswordAttempts = row.reset_password_attempts || 0;
    this.resetPasswordSentAt = row.reset_password_sent_at;
    this.resetPasswordExpire = row.reset_password_expires_at;
    this.preferredLanguage = row.preferred_language || undefined;
    this.role = row.roles.code;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  comparePassword(plain) {
    return bcrypt.compare(plain, this.password);
  }

  toPublic() {
    const displayName = this.fullName || this.name;
    return {
      id: this._id,
      fullName: displayName,
      name: displayName,
      email: this.email,
      phone: this.phone,
      phoneNumber: this.phoneNumber || this.phone || '',
      acceptedPolicy: Boolean(this.acceptedPolicy),
      acceptedPolicyVersion: this.acceptedPolicyVersion || '',
      acceptedPolicyAt: this.acceptedPolicyAt,
      profileStatus: this.profileStatus || PROFILE_STATUS.INCOMPLETE,
      avatar: this.avatar,
      role: this.role,
      status: this.status,
      emailVerified: this.emailVerified,
      preferredLanguage: this.preferredLanguage || undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  async save() {
    let passwordHash = this.password;
    if (passwordHash && !String(passwordHash).startsWith('$2')) {
      passwordHash = await bcrypt.hash(passwordHash, 12);
      this.password = passwordHash;
    }
    const phone = storedVnMobile(this.phoneNumber || this.phone);
    let row;
    try {
      row = await prisma.users.update({
      where: { id: this.pgId },
      data: {
        full_name: this.fullName || this.name,
        email: this.email ? normalizeEmail(this.email) : undefined,
        phone_number: phone,
        password_hash: passwordHash,
        profile_status: this.profileStatus,
        token_version: this.tokenVersion,
        avatar_url: this.avatar || '',
        account_status: this.status,
        email_verified: Boolean(this.emailVerified),
        verification_code: this.verificationCode || '',
        verification_attempts: this.verificationAttempts || 0,
        verification_sent_at: this.verificationSentAt,
        verification_expires_at: this.verificationExpire,
        reset_password_token: this.resetPasswordToken || '',
        reset_password_attempts: this.resetPasswordAttempts || 0,
        reset_password_sent_at: this.resetPasswordSentAt,
        reset_password_expires_at: this.resetPasswordExpire,
        preferred_language: this.preferredLanguage || null,
        updated_at: new Date(),
      },
      select: userSelect,
    });
    } catch (err) {
      const { throwIfIdentityUniqueConflict } = require('../services/accountIdentity');
      throwIfIdentityUniqueConflict(err);
    }
    return new PgUser(row);
  }
}

function wrap(row) {
  return row ? new PgUser(row) : null;
}

async function findOneBy(where) {
  const row = await prisma.users.findFirst({ where, select: userSelect });
  return wrap(row);
}

const userRepository = {
  async findByEmail(email) {
    const value = normalizeEmail(email);
    if (!value) return null;
    return findOneBy({ email: { equals: value, mode: 'insensitive' } });
  },

  async findByPhone(phoneNumber) {
    const variants = phoneLookupValues(phoneNumber);
    if (!variants.length) return null;
    return findOneBy({ phone_number: { in: variants } });
  },

  findByEmailWithPassword(email) {
    return this.findByEmail(email);
  },

  findByIdWithPassword(id) {
    return findOneBy(wherePublicId(id));
  },

  findById(id) {
    return findOneBy(wherePublicId(id));
  },

  findByIdForAuth(id) {
    return findOneBy(wherePublicId(id));
  },

  async create(payload) {
    const role = await prisma.roles.findUnique({ where: { code: payload.role } });
    if (!role) {
      const error = new Error(`PostgreSQL role missing: ${payload.role}`);
      error.statusCode = 500;
      throw error;
    }
    const passwordHash = String(payload.password || '').startsWith('$2')
      ? payload.password
      : await bcrypt.hash(payload.password, 12);
    const legacyId = crypto.randomBytes(12).toString('hex');
    const email = normalizeEmail(payload.email);
    const phone = storedVnMobile(payload.phoneNumber || payload.phone);
    let row;
    try {
      row = await prisma.users.create({
      data: {
        legacy_mongo_id: legacyId,
        role_id: role.id,
        full_name: payload.fullName || payload.name,
        email,
        phone_number: phone,
        password_hash: passwordHash,
        accepted_policy: Boolean(payload.acceptedPolicy),
        accepted_policy_version: payload.acceptedPolicyVersion || '',
        accepted_policy_at: payload.acceptedPolicyAt || null,
        profile_status: payload.profileStatus || 'INCOMPLETE',
        token_version: 0,
        avatar_url: payload.avatar || '',
        account_status: payload.status || 'PENDING_EMAIL',
        email_verified: Boolean(payload.emailVerified),
        verification_code: '',
        verification_attempts: 0,
        reset_password_token: '',
        reset_password_attempts: 0,
        refresh_token: '',
        preferred_language: payload.preferredLanguage || null,
      },
      select: userSelect,
    });
    } catch (err) {
      const { throwIfIdentityUniqueConflict } = require('../services/accountIdentity');
      throwIfIdentityUniqueConflict(err);
    }
    return wrap(row);
  },

  async updateById(id, updates) {
    const current = await this.findById(id);
    if (!current) return null;
    if (updates.fullName || updates.name) {
      current.fullName = updates.fullName || updates.name;
      current.name = current.fullName;
    }
    if (updates.email !== undefined) current.email = normalizeEmail(updates.email);
    if (updates.phone !== undefined || updates.phoneNumber !== undefined) {
      const phone = storedVnMobile(updates.phoneNumber || updates.phone);
      current.phone = phone;
      current.phoneNumber = phone;
    }
    if (updates.preferredLanguage !== undefined) current.preferredLanguage = updates.preferredLanguage || null;
    if (updates.avatar !== undefined) current.avatar = updates.avatar || '';
    if (updates.profileStatus !== undefined) current.profileStatus = updates.profileStatus;
    if (updates.status !== undefined) current.status = updates.status;
    return current.save();
  },

  save(document) {
    return document.save();
  },

  async incrementTokenVersion(id) {
    const updated = await prisma.users.update({
      where: wherePublicId(id),
      data: { token_version: { increment: 1 }, updated_at: new Date() },
      select: userSelect,
    });
    return wrap(updated);
  },

  findByEmailForVerify(email) {
    return this.findByEmail(email);
  },

  findByEmailForReset(email) {
    return this.findByEmail(email);
  },

  async issueVerificationOtp({ userId, codeHash, expiresAt, sentAt, cooldownBefore }) {
    const result = await prisma.users.updateMany({
      where: {
        ...wherePublicId(userId),
        OR: [{ verification_sent_at: null }, { verification_sent_at: { lte: cooldownBefore } }],
      },
      data: {
        verification_code: codeHash,
        verification_expires_at: expiresAt,
        verification_sent_at: sentAt,
        verification_attempts: 0,
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findById(userId);
  },

  async issueResetPasswordOtp({ userId, codeHash, expiresAt, sentAt, cooldownBefore }) {
    const result = await prisma.users.updateMany({
      where: {
        ...wherePublicId(userId),
        OR: [{ reset_password_sent_at: null }, { reset_password_sent_at: { lte: cooldownBefore } }],
      },
      data: {
        reset_password_token: codeHash,
        reset_password_expires_at: expiresAt,
        reset_password_sent_at: sentAt,
        reset_password_attempts: 0,
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findById(userId);
  },

  async incrementOtpAttempts({ userId, kind, codeHash, now, maxAttempts }) {
    const isVerify = kind === 'verification';
    const result = await prisma.users.updateMany({
      where: {
        ...wherePublicId(userId),
        ...(isVerify
          ? {
              verification_code: codeHash,
              verification_expires_at: { gt: now },
              verification_attempts: { lt: maxAttempts },
            }
          : {
              reset_password_token: codeHash,
              reset_password_expires_at: { gt: now },
              reset_password_attempts: { lt: maxAttempts },
            }),
      },
      data: isVerify
        ? { verification_attempts: { increment: 1 }, updated_at: new Date() }
        : { reset_password_attempts: { increment: 1 }, updated_at: new Date() },
    });
    if (!result.count) return null;
    return this.findById(userId);
  },

  async consumeVerificationOtp({ userId, codeHash, now, maxAttempts, activeStatus }) {
    const result = await prisma.users.updateMany({
      where: {
        ...wherePublicId(userId),
        verification_code: codeHash,
        verification_expires_at: { gt: now },
        verification_attempts: { lt: maxAttempts },
      },
      data: {
        email_verified: true,
        account_status: activeStatus,
        verification_code: '',
        verification_expires_at: null,
        verification_attempts: 0,
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findById(userId);
  },

  async consumeResetPasswordOtp({ userId, codeHash, now, maxAttempts }) {
    const result = await prisma.users.updateMany({
      where: {
        ...wherePublicId(userId),
        reset_password_token: codeHash,
        reset_password_expires_at: { gt: now },
        reset_password_attempts: { lt: maxAttempts },
      },
      data: {
        reset_password_token: '',
        reset_password_expires_at: null,
        reset_password_attempts: 0,
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findById(userId);
  },

  async listByRole(role) {
    const rows = await prisma.users.findMany({
      where: { roles: { code: role } },
      select: userSelect,
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => new PgUser(row));
  },

  async countAll() {
    return prisma.users.count();
  },

  async countByRole(role) {
    return prisma.users.count({ where: { roles: { code: role } } });
  },

  async findManyByIds(ids, { excludeStatuses = [] } = {}) {
    const legacy = [...new Set((ids || []).map((id) => String(id || '')).filter(Boolean))];
    if (!legacy.length) return [];
    const rows = await prisma.users.findMany({
      where: {
        legacy_mongo_id: { in: legacy },
        ...(excludeStatuses.length ? { account_status: { notIn: excludeStatuses } } : {}),
      },
      select: userSelect,
    });
    return rows.map((row) => new PgUser(row));
  },
};

module.exports = { userRepository, PgUser };
