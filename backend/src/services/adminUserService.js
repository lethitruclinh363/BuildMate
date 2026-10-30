const { prisma } = require('../config/prisma');
const { USER_STATUS, ROLES } = require('../models/user.model');
const { AUDIT_ACTION } = require('../models/AuditLog');
const { NOTIFICATION_TYPE } = require('../models/Notification');
const { ApiError } = require('../utils/ApiError');
const { writeAudit } = require('./auditService');
const { notify } = require('./notificationService');
const { disconnectUser } = require('./socketService');

if (typeof BigInt !== 'undefined' && !BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

function sanitizeRecord(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'bigint') return val.toString();
  if (val instanceof Date) return val;
  if (Array.isArray(val)) return val.map(sanitizeRecord);
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = sanitizeRecord(v);
    }
    return out;
  }
  return val;
}

function wherePublicId(id) {
  const value = String(id || '');
  if (/^[0-9a-f]{24}$/i.test(value)) return { legacy_mongo_id: value };
  if (/^\d+$/.test(value)) return { id: BigInt(value) };
  return { legacy_mongo_id: value };
}

function mapUserRecord(row) {
  const contractorProfile = row.contractor_profiles_contractor_profiles_user_idTousers;
  const store = row.stores;

  return {
    id: row.legacy_mongo_id || String(row.id),
    numericId: String(row.id),
    name: row.full_name,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone_number || '',
    phoneNumber: row.phone_number || '',
    role: row.roles?.code || '',
    status: row.account_status,
    accountStatus: row.account_status,
    emailVerified: row.email_verified,
    avatar: row.avatar_url || '',
    tokenVersion: row.token_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    partnerStatus: contractorProfile
      ? {
          businessName: contractorProfile.business_name,
          verificationStatus: contractorProfile.verification_status,
          city: contractorProfile.locations?.city || '',
          address: contractorProfile.locations?.formatted_address || '',
        }
      : undefined,
    storeStatus: store
      ? {
          storeName: store.name,
          isActive: store.status === 'ACTIVE',
          status: store.status,
          storeType: store.store_type,
          city: store.locations?.city || '',
          address: store.locations?.formatted_address || '',
        }
      : undefined,
  };
}

async function listUsers({
  page = 1,
  limit = 20,
  role = 'ALL',
  status = 'ALL',
  keyword = '',
} = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  if (role && role !== 'ALL') {
    where.roles = { code: role };
  }

  if (status && status !== 'ALL') {
    where.account_status = status;
  }

  const cleanKeyword = String(keyword || '').trim();
  if (cleanKeyword) {
    where.OR = [
      { full_name: { contains: cleanKeyword, mode: 'insensitive' } },
      { email: { contains: cleanKeyword, mode: 'insensitive' } },
      { phone_number: { contains: cleanKeyword } },
    ];
  }

  const [rows, total, statsCounts] = await Promise.all([
    prisma.users.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { created_at: 'desc' },
      include: {
        roles: { select: { code: true } },
        contractor_profiles_contractor_profiles_user_idTousers: {
          select: {
            business_name: true,
            verification_status: true,
            locations: { select: { formatted_address: true, city: true } },
          },
        },
        stores: {
          select: {
            name: true,
            status: true,
            store_type: true,
            locations: { select: { formatted_address: true, city: true } },
          },
        },
      },
    }),
    prisma.users.count({ where }),
    prisma.$transaction([
      prisma.users.count(),
      prisma.users.count({ where: { account_status: USER_STATUS.ACTIVE } }),
      prisma.users.count({ where: { account_status: USER_STATUS.BLOCKED } }),
      prisma.users.count({ where: { account_status: USER_STATUS.PENDING_EMAIL } }),
    ]),
  ]);

  const items = rows.map(mapUserRecord);
  const totalPages = Math.max(1, Math.ceil(total / limitNum));

  return sanitizeRecord({
    items,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
    stats: {
      total: statsCounts[0],
      active: statsCounts[1],
      blocked: statsCounts[2],
      pending: statsCounts[3],
    },
  });
}

async function getUser(userId) {
  const where = wherePublicId(userId);
  const row = await prisma.users.findFirst({
    where,
    include: {
      roles: { select: { code: true } },
      contractor_profiles_contractor_profiles_user_idTousers: {
        select: {
          id: true,
          legacy_mongo_id: true,
          business_name: true,
          tax_code: true,
          verification_status: true,
          years_experience: true,
          worker_count: true,
          submitted_at: true,
          reviewed_at: true,
          locations: { select: { formatted_address: true, city: true } },
        },
      },
      stores: {
        select: {
          id: true,
          legacy_mongo_id: true,
          name: true,
          store_type: true,
          phone: true,
          contact_name: true,
          contact_email: true,
          status: true,
          locations: { select: { formatted_address: true, city: true } },
        },
      },
    },
  });

  if (!row) {
    throw new ApiError(404, 'User not found');
  }

  const user = mapUserRecord(row);
  const publicIdStr = row.legacy_mongo_id || String(row.id);

  // Fetch counts and audit logs in parallel
  const [repairCount, materialCount, complaintCount, auditRows] = await Promise.all([
    prisma.service_orders.count({
      where: {
        OR: [{ customer_user_id: row.id }, { contractor_user_id: row.id }],
      },
    }).catch(() => 0),
    prisma.material_orders.count({
      where: {
        OR: [
          { customer_user_id: row.id },
          ...(row.stores?.id ? [{ store_id: row.stores.id }] : []),
        ],
      },
    }).catch(() => 0),
    prisma.complaints.count({
      where: {
        OR: [
          { created_by_user_id: row.id },
          { against_user_id: row.id },
        ],
      },
    }).catch(() => 0),
    prisma.audit_logs.findMany({
      where: {
        entity_type: 'User',
        entity_id: publicIdStr,
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        users: {
          select: {
            legacy_mongo_id: true,
            full_name: true,
            email: true,
            roles: { select: { code: true } },
          },
        },
      },
    }).catch(() => []),
  ]);

  const auditHistory = auditRows.map((a) => {
    const metaAction = a.meta && typeof a.meta === 'object' ? a.meta.action : null;
    return {
      id: a.legacy_mongo_id || String(a.id),
      action: metaAction || a.action,
      entityType: a.entity_type,
      entityId: a.entity_id,
      meta: a.meta || {},
      ip: a.ip || '',
      createdAt: a.created_at,
      actor: a.users
        ? {
            id: a.users.legacy_mongo_id,
            name: a.users.full_name,
            email: a.users.email,
            role: a.users.roles?.code || '',
          }
        : null,
    };
  });

  return sanitizeRecord({
    user,
    partnerProfile: row.contractor_profiles_contractor_profiles_user_idTousers || null,
    store: row.stores || null,
    counts: {
      repairOrders: repairCount,
      materialOrders: materialCount,
      complaints: complaintCount,
    },
    auditHistory,
  });
}

async function lockUser(userId, adminId, reason = '') {
  const where = wherePublicId(userId);
  const targetUser = await prisma.users.findFirst({
    where,
    include: { roles: { select: { code: true } } },
  });

  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  const targetPublicId = targetUser.legacy_mongo_id || String(targetUser.id);
  const adminIdStr = String(adminId || '');
  if (targetPublicId === adminIdStr || String(targetUser.id) === adminIdStr) {
    throw new ApiError(403, 'Cannot lock your own account');
  }

  const targetRole = targetUser.roles?.code;
  if (targetRole === ROLES.ADMIN) {
    throw new ApiError(403, 'Administrator accounts cannot be locked');
  }

  if (targetUser.account_status === USER_STATUS.BLOCKED || targetUser.account_status === USER_STATUS.BANNED) {
    throw new ApiError(409, 'Account is already locked');
  }

  const previousStatus = targetUser.account_status;

  // Atomic conditional update
  const updatedResult = await prisma.users.updateMany({
    where: {
      id: targetUser.id,
      account_status: { notIn: [USER_STATUS.BLOCKED, USER_STATUS.BANNED] },
    },
    data: {
      account_status: USER_STATUS.BLOCKED,
      token_version: { increment: 1 },
      updated_at: new Date(),
    },
  });

  if (updatedResult.count === 0) {
    throw new ApiError(409, 'Account is already locked or in conflicting state');
  }

  // Invalidate any active socket connections
  disconnectUser(targetPublicId);
  disconnectUser(String(targetUser.id));

  // Write audit log safely satisfying database check constraint (chk_audit_logs_action)
  try {
    await writeAudit({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: AUDIT_ACTION.PROFILE_UPDATE || 'PROFILE_UPDATE',
      entityType: 'User',
      entityId: targetPublicId,
      meta: {
        action: 'ADMIN_LOCK_USER',
        type: 'ACCOUNT_LOCK',
        userId: targetPublicId,
        userEmail: targetUser.email,
        userName: targetUser.full_name,
        userRole: targetRole,
        previousStatus,
        nextStatus: USER_STATUS.BLOCKED,
        reason: String(reason || '').trim(),
      },
    });
  } catch (auditErr) {
    console.error('[lockUser] audit write failed:', auditErr?.message);
  }

  // Dispatch notification
  try {
    await notify({
      userId: targetPublicId,
      title: 'Tài khoản bị khóa',
      message: 'Tài khoản của bạn đã bị tạm khóa bởi quản trị viên.',
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      meta: { status: USER_STATUS.BLOCKED, reason: String(reason || '').trim() },
    });
  } catch (err) {
    console.warn('[lockUser] notify warning:', err?.message);
  }

  const fresh = await getUser(targetPublicId);
  return sanitizeRecord({
    success: true,
    message: 'User account has been locked successfully',
    user: fresh.user,
  });
}

async function unlockUser(userId, adminId, reason = '') {
  const where = wherePublicId(userId);
  const targetUser = await prisma.users.findFirst({
    where,
    include: { roles: { select: { code: true } } },
  });

  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  if (targetUser.account_status !== USER_STATUS.BLOCKED && targetUser.account_status !== USER_STATUS.BANNED) {
    throw new ApiError(409, 'Account is not currently locked');
  }

  const previousStatus = targetUser.account_status;
  const targetPublicId = targetUser.legacy_mongo_id || String(targetUser.id);
  const targetRole = targetUser.roles?.code;

  // Atomic conditional update
  const updatedResult = await prisma.users.updateMany({
    where: {
      id: targetUser.id,
      account_status: { in: [USER_STATUS.BLOCKED, USER_STATUS.BANNED] },
    },
    data: {
      account_status: USER_STATUS.ACTIVE,
      token_version: { increment: 1 },
      updated_at: new Date(),
    },
  });

  if (updatedResult.count === 0) {
    throw new ApiError(409, 'Account is not in a locked state');
  }

  // Write audit log safely satisfying database check constraint (chk_audit_logs_action)
  try {
    await writeAudit({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: AUDIT_ACTION.PROFILE_UPDATE || 'PROFILE_UPDATE',
      entityType: 'User',
      entityId: targetPublicId,
      meta: {
        action: 'ADMIN_UNLOCK_USER',
        type: 'ACCOUNT_UNLOCK',
        userId: targetPublicId,
        userEmail: targetUser.email,
        userName: targetUser.full_name,
        userRole: targetRole,
        previousStatus,
        nextStatus: USER_STATUS.ACTIVE,
        reason: String(reason || '').trim(),
      },
    });
  } catch (auditErr) {
    console.error('[unlockUser] audit write failed:', auditErr?.message);
  }

  // Dispatch notification
  try {
    await notify({
      userId: targetPublicId,
      title: 'Tài khoản đã được mở khóa',
      message: 'Tài khoản của bạn đã được mở khóa bởi quản trị viên. Vui lòng đăng nhập lại.',
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      meta: { status: USER_STATUS.ACTIVE, reason: String(reason || '').trim() },
    });
  } catch (err) {
    console.warn('[unlockUser] notify warning:', err?.message);
  }

  const fresh = await getUser(targetPublicId);
  return sanitizeRecord({
    success: true,
    message: 'User account has been unlocked successfully',
    user: fresh.user,
  });
}

module.exports = {
  listUsers,
  getUser,
  lockUser,
  unlockUser,
};
