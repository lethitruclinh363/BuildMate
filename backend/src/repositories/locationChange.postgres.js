const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const { ensureLocationChangeTable } = require('./column-ensure');
const { ApiError } = require('../utils/ApiError');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function legacyOf(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

async function resolveUser(userIdOrLegacy) {
  const raw = legacyOf(userIdOrLegacy);
  if (!raw) return null;
  if (/^[a-f0-9]{24}$/i.test(raw)) {
    return prisma.users.findFirst({ where: { legacy_mongo_id: raw } });
  }
  if (/^\d+$/.test(raw)) {
    return prisma.users.findFirst({ where: { id: BigInt(raw) } });
  }
  return prisma.users.findFirst({ where: { legacy_mongo_id: raw } });
}

function formatRequest(row, user) {
  if (!row) return null;
  return {
    id: String(row.legacy_mongo_id || row.id),
    dbId: String(row.id),
    partnerId: String(user?.legacy_mongo_id || row.partner_id),
    partnerType: row.partner_type,
    status: row.status,
    reason: row.reason,
    currentLocation: {
      locationId: row.current_location_id ? String(row.current_location_id) : null,
      address: row.current_address || '',
      city: row.current_city || '',
      lat: row.current_latitude != null ? Number(row.current_latitude) : null,
      lng: row.current_longitude != null ? Number(row.current_longitude) : null,
    },
    proposedLocation: {
      address: row.proposed_address,
      city: row.proposed_city,
      lat: Number(row.proposed_latitude),
      lng: Number(row.proposed_longitude),
      locationSource: row.proposed_location_source || '',
      providerRefId: row.proposed_provider_ref_id || '',
    },
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    adminNote: row.admin_note || '',
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    user: user
      ? {
          id: String(user.legacy_mongo_id || user.id),
          name: user.full_name || '',
          email: user.email || '',
          phone: user.phone_number || '',
        }
      : null,
  };
}

async function createRequest({
  userId,
  partnerType,
  reason,
  currentLocationId,
  currentAddress,
  currentCity,
  currentLat,
  currentLng,
  proposedAddress,
  proposedCity,
  proposedLat,
  proposedLng,
  proposedLocationSource,
  proposedProviderRefId,
}) {
  await ensureLocationChangeTable();
  const user = await resolveUser(userId);
  if (!user) throw new ApiError(404, 'User not found in database');

  const legacyMongoId = newId();

  try {
    const created = await prisma.partner_location_change_requests.create({
      data: {
        legacy_mongo_id: legacyMongoId,
        partner_id: user.id,
        partner_type: partnerType,
        status: 'PENDING',
        reason: reason || '',
        current_location_id: currentLocationId ? BigInt(currentLocationId) : null,
        current_address: currentAddress || '',
        current_city: currentCity || '',
        current_latitude: currentLat != null ? Number(currentLat) : null,
        current_longitude: currentLng != null ? Number(currentLng) : null,
        proposed_address: proposedAddress,
        proposed_city: proposedCity,
        proposed_latitude: Number(proposedLat),
        proposed_longitude: Number(proposedLng),
        proposed_location_source: proposedLocationSource || '',
        proposed_provider_ref_id: proposedProviderRefId || '',
      },
    });

    return formatRequest(created, user);
  } catch (err) {
    if (err.code === 'P2002' || String(err.message).includes('uq_partner_pending_location_request')) {
      throw new ApiError(409, 'Bạn đang có một yêu cầu thay đổi vị trí chờ Quản trị viên xét duyệt.');
    }
    throw err;
  }
}

async function findPendingByPartner(userId, partnerType) {
  await ensureLocationChangeTable();
  const user = await resolveUser(userId);
  if (!user) return null;

  const row = await prisma.partner_location_change_requests.findFirst({
    where: {
      partner_id: user.id,
      partner_type: partnerType,
      status: 'PENDING',
    },
    orderBy: { created_at: 'desc' },
  });

  return formatRequest(row, user);
}

async function findRequestsByPartner(userId, partnerType) {
  await ensureLocationChangeTable();
  const user = await resolveUser(userId);
  if (!user) return [];

  const rows = await prisma.partner_location_change_requests.findMany({
    where: {
      partner_id: user.id,
      partner_type: partnerType,
    },
    orderBy: { created_at: 'desc' },
  });

  return rows.map((r) => formatRequest(r, user));
}

async function findRequestById(id) {
  await ensureLocationChangeTable();
  const rawId = legacyOf(id);
  const isMongo = /^[a-f0-9]{24}$/i.test(rawId);
  const isNumeric = /^\d+$/.test(rawId);

  const row = await prisma.partner_location_change_requests.findFirst({
    where: isMongo
      ? { legacy_mongo_id: rawId }
      : isNumeric
        ? { OR: [{ id: BigInt(rawId) }, { legacy_mongo_id: rawId }] }
        : { legacy_mongo_id: rawId },
  });

  if (!row) return null;
  const user = await prisma.users.findUnique({ where: { id: row.partner_id } });
  return formatRequest(row, user);
}

async function adminListRequests({ status, partnerType, page = 1, limit = 20 } = {}) {
  await ensureLocationChangeTable();
  const where = {};
  if (status) where.status = status;
  if (partnerType) where.partner_type = partnerType;

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const [total, rows] = await Promise.all([
    prisma.partner_location_change_requests.count({ where }),
    prisma.partner_location_change_requests.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: safeLimit,
    }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.partner_id))];
  const users = await prisma.users.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [String(u.id), u]));

  // Also fetch store / contractor profile business names for convenient admin display
  const [profiles, stores] = await Promise.all([
    prisma.contractor_profiles.findMany({ where: { user_id: { in: userIds } } }),
    prisma.stores.findMany({ where: { owner_user_id: { in: userIds } } }),
  ]);
  const profileMap = new Map(profiles.map((p) => [String(p.user_id), p]));
  const storeMap = new Map(stores.map((s) => [String(s.owner_user_id), s]));

  const items = rows.map((r) => {
    const user = userMap.get(String(r.partner_id));
    const formatted = formatRequest(r, user);
    const profile = profileMap.get(String(r.partner_id));
    const store = storeMap.get(String(r.partner_id));
    formatted.businessName =
      (r.partner_type === 'MATERIAL_STORE_OWNER' ? store?.name : profile?.business_name) ||
      user?.full_name ||
      '';
    return formatted;
  });

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

async function approveLocationChange(requestId, adminUserId, adminNote = '') {
  await ensureLocationChangeTable();
  const adminUser = await resolveUser(adminUserId);
  const reqObj = await findRequestById(requestId);
  if (!reqObj) throw new ApiError(404, 'Location change request not found');
  if (reqObj.status !== 'PENDING') {
    throw new ApiError(409, 'Only PENDING requests can be approved');
  }

  const dbId = BigInt(reqObj.dbId);
  const partnerId = BigInt(reqObj.user?.id ? (await resolveUser(reqObj.user.id)).id : reqObj.partnerId);
  const approvalDate = new Date();

  return prisma.$transaction(async (tx) => {
    // 1. Double check and lock row status
    const currentReq = await tx.partner_location_change_requests.findUnique({
      where: { id: dbId },
    });
    if (!currentReq || currentReq.status !== 'PENDING') {
      throw new ApiError(409, 'Yêu cầu không ở trạng thái chờ duyệt hoặc đã được xử lý bởi quản trị viên khác.');
    }

    // 2. Update request status to APPROVED
    const updatedReq = await tx.partner_location_change_requests.update({
      where: { id: dbId },
      data: {
        status: 'APPROVED',
        reviewed_by: adminUser ? adminUser.id : null,
        reviewed_at: approvalDate,
        admin_note: adminNote || '',
        updated_at: approvalDate,
      },
    });

    // 3. Update or create official location in locations table
    let locationId = currentReq.current_location_id;
    if (locationId) {
      await tx.locations.update({
        where: { id: locationId },
        data: {
          formatted_address: currentReq.proposed_address,
          city: currentReq.proposed_city,
          latitude: currentReq.proposed_latitude,
          longitude: currentReq.proposed_longitude,
          location_source: currentReq.proposed_location_source || '',
          provider_ref_id: currentReq.proposed_provider_ref_id || '',
          is_confirmed: true,
          confirmed_at: approvalDate,
          location_approved_at: approvalDate,
          updated_at: approvalDate,
        },
      });
    } else {
      const createdLoc = await tx.locations.create({
        data: {
          formatted_address: currentReq.proposed_address,
          city: currentReq.proposed_city,
          latitude: currentReq.proposed_latitude,
          longitude: currentReq.proposed_longitude,
          location_source: currentReq.proposed_location_source || '',
          provider_ref_id: currentReq.proposed_provider_ref_id || '',
          is_confirmed: true,
          confirmed_at: approvalDate,
          location_approved_at: approvalDate,
        },
      });
      locationId = createdLoc.id;
    }

    // 4. Update contractor_profiles if exists
    const profile = await tx.contractor_profiles.findUnique({
      where: { user_id: partnerId },
    });
    if (profile) {
      await tx.contractor_profiles.update({
        where: { id: profile.id },
        data: {
          location_id: locationId,
          updated_at: approvalDate,
        },
      });
    }

    // 5. Update stores if exists
    const store = await tx.stores.findUnique({
      where: { owner_user_id: partnerId },
    });
    if (store) {
      await tx.stores.update({
        where: { id: store.id },
        data: {
          location_id: locationId,
          address: currentReq.proposed_address,
          city: currentReq.proposed_city,
          updated_at: approvalDate,
        },
      });
    }

    const user = await tx.users.findUnique({ where: { id: partnerId } });
    return formatRequest(updatedReq, user);
  });
}

async function rejectLocationChange(requestId, adminUserId, reason) {
  await ensureLocationChangeTable();
  const adminUser = await resolveUser(adminUserId);
  const reqObj = await findRequestById(requestId);
  if (!reqObj) throw new ApiError(404, 'Location change request not found');
  if (reqObj.status !== 'PENDING') {
    throw new ApiError(409, 'Only PENDING requests can be rejected');
  }

  const dbId = BigInt(reqObj.dbId);
  const partnerId = BigInt(reqObj.user?.id ? (await resolveUser(reqObj.user.id)).id : reqObj.partnerId);
  const rejectDate = new Date();

  return prisma.$transaction(async (tx) => {
    const currentReq = await tx.partner_location_change_requests.findUnique({
      where: { id: dbId },
    });
    if (!currentReq || currentReq.status !== 'PENDING') {
      throw new ApiError(409, 'Yêu cầu không ở trạng thái chờ duyệt hoặc đã được xử lý bởi quản trị viên khác.');
    }

    const updatedReq = await tx.partner_location_change_requests.update({
      where: { id: dbId },
      data: {
        status: 'REJECTED',
        reviewed_by: adminUser ? adminUser.id : null,
        reviewed_at: rejectDate,
        admin_note: reason || '',
        updated_at: rejectDate,
      },
    });

    const user = await tx.users.findUnique({ where: { id: partnerId } });
    return formatRequest(updatedReq, user);
  });
}

module.exports = {
  createRequest,
  findPendingByPartner,
  findRequestsByPartner,
  findRequestById,
  adminListRequests,
  approveLocationChange,
  rejectLocationChange,
};
