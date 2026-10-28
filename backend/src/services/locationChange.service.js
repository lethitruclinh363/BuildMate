const locationChangeRepo = require('../repositories/locationChange.postgres');
const { ContractorProfile, Store } = require('../repositories/partnerAccess');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ApiError } = require('../utils/ApiError');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');

const LOCATION_CHANGE_COOLDOWN_DAYS = 30;
const LOCATION_CHANGE_COOLDOWN_MS = LOCATION_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function extractCoords(item) {
  if (!item) return null;
  const lat =
    item.lat !== undefined && item.lat !== null
      ? Number(item.lat)
      : item.latitude !== undefined && item.latitude !== null
        ? Number(item.latitude)
        : item.location?.coordinates?.[1] != null
          ? Number(item.location.coordinates[1])
          : null;

  const lng =
    item.lng !== undefined && item.lng !== null
      ? Number(item.lng)
      : item.longitude !== undefined && item.longitude !== null
        ? Number(item.longitude)
        : item.location?.coordinates?.[0] != null
          ? Number(item.location.coordinates[0])
          : null;

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

async function checkEligibility(userId, partnerType) {
  const profile = await ContractorProfile.findOne({ userId });
  const store = await Store.findOne({ contractorId: userId });

  const isApproved = profile?.verificationStatus === VERIFICATION_STATUS.APPROVED;
  if (!isApproved) {
    return {
      isApproved: false,
      currentLocation: null,
      lastApprovedAt: null,
      nextAllowedAt: null,
      cooldownDays: LOCATION_CHANGE_COOLDOWN_DAYS,
      remainingDays: null,
      hasPendingRequest: false,
      pendingRequest: null,
      canRequest: false,
      reasons: ['Chỉ đối tác có hồ sơ đã được phê duyệt (APPROVED) mới có thể gửi yêu cầu thay đổi vị trí.'],
    };
  }

  const coords = extractCoords(store) || extractCoords(profile);
  const currentAddress = store?.address || profile?.address || '';
  const currentCity = store?.city || profile?.city || '';
  const locationId = store?.locationId || profile?.locationId || null;

  if (!coords) {
    return {
      isApproved: true,
      currentLocation: {
        locationId: locationId ? String(locationId) : null,
        address: currentAddress,
        city: currentCity,
        lat: null,
        lng: null,
      },
      lastApprovedAt: null,
      nextAllowedAt: null,
      cooldownDays: LOCATION_CHANGE_COOLDOWN_DAYS,
      remainingDays: null,
      hasPendingRequest: false,
      pendingRequest: null,
      canRequest: false,
      reasons: ['Hồ sơ chưa có tọa độ vị trí được xác nhận. Vui lòng liên hệ Quản trị viên để xác lập vị trí ban đầu.'],
    };
  }

  // Check if there is an active PENDING request
  const pending = await locationChangeRepo.findPendingByPartner(userId, partnerType);
  if (pending) {
    return {
      isApproved: true,
      currentLocation: {
        locationId: locationId ? String(locationId) : null,
        address: currentAddress,
        city: currentCity,
        lat: coords.lat,
        lng: coords.lng,
      },
      lastApprovedAt: profile?.locationApprovedAt || store?.locationApprovedAt || profile?.reviewedAt || null,
      nextAllowedAt: null,
      cooldownDays: LOCATION_CHANGE_COOLDOWN_DAYS,
      remainingDays: null,
      hasPendingRequest: true,
      pendingRequest: pending,
      canRequest: false,
      reasons: ['Bạn đang có một yêu cầu thay đổi vị trí chờ Quản trị viên xét duyệt.'],
    };
  }

  // Calculate cooldown
  const rawApprovedAt =
    profile?.locationApprovedAt ||
    store?.locationApprovedAt ||
    profile?.reviewedAt ||
    profile?.updatedAt ||
    profile?.createdAt;

  const lastApprovedTime = rawApprovedAt ? new Date(rawApprovedAt).getTime() : Date.now();
  const nextAllowedTime = lastApprovedTime + LOCATION_CHANGE_COOLDOWN_MS;
  const now = Date.now();

  if (now < nextAllowedTime) {
    const remainingMs = nextAllowedTime - now;
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    return {
      isApproved: true,
      currentLocation: {
        locationId: locationId ? String(locationId) : null,
        address: currentAddress,
        city: currentCity,
        lat: coords.lat,
        lng: coords.lng,
      },
      lastApprovedAt: new Date(lastApprovedTime).toISOString(),
      nextAllowedAt: new Date(nextAllowedTime).toISOString(),
      cooldownDays: LOCATION_CHANGE_COOLDOWN_DAYS,
      remainingDays,
      hasPendingRequest: false,
      pendingRequest: null,
      canRequest: false,
      reasons: [`Chưa đủ ${LOCATION_CHANGE_COOLDOWN_DAYS} ngày kể từ lần phê duyệt vị trí gần nhất (còn ${remainingDays} ngày).`],
    };
  }

  return {
    isApproved: true,
    currentLocation: {
      locationId: locationId ? String(locationId) : null,
      address: currentAddress,
      city: currentCity,
      lat: coords.lat,
      lng: coords.lng,
    },
    lastApprovedAt: new Date(lastApprovedTime).toISOString(),
    nextAllowedAt: new Date(nextAllowedTime).toISOString(),
    cooldownDays: LOCATION_CHANGE_COOLDOWN_DAYS,
    remainingDays: 0,
    hasPendingRequest: false,
    pendingRequest: null,
    canRequest: true,
    reasons: [],
  };
}

async function requestLocationChange(userId, partnerType, payload) {
  const eligibility = await checkEligibility(userId, partnerType);
  if (!eligibility.canRequest) {
    throw new ApiError(400, eligibility.reasons[0] || 'Chưa đủ điều kiện gửi yêu cầu thay đổi vị trí');
  }

  const proposedAddress = String(payload.proposedAddress || '').trim();
  if (!proposedAddress || proposedAddress.length < 4) {
    throw new ApiError(422, 'Địa chỉ đề xuất phải có ít nhất 4 ký tự.');
  }

  const proposedCity = String(payload.proposedCity || '').trim() || 'Cần Thơ';

  const proposedLat = Number(payload.proposedLat);
  const proposedLng = Number(payload.proposedLng);

  if (
    !Number.isFinite(proposedLat) ||
    !Number.isFinite(proposedLng) ||
    proposedLat < -90 ||
    proposedLat > 90 ||
    proposedLng < -180 ||
    proposedLng > 180 ||
    (proposedLat === 0 && proposedLng === 0)
  ) {
    throw new ApiError(422, 'Tọa độ đề xuất không hợp lệ hoặc không được là (0, 0).');
  }

  const reason = String(payload.reason || '').trim();
  if (!reason || reason.length < 8) {
    throw new ApiError(422, 'Lý do thay đổi vị trí phải có ít nhất 8 ký tự.');
  }

  // Prevent duplicate request with identical coordinates and address
  const current = eligibility.currentLocation;
  if (current && current.lat != null && current.lng != null) {
    const diffLat = Math.abs(current.lat - proposedLat);
    const diffLng = Math.abs(current.lng - proposedLng);
    if (
      diffLat < 0.00001 &&
      diffLng < 0.00001 &&
      proposedAddress.toLowerCase() === current.address.trim().toLowerCase()
    ) {
      throw new ApiError(400, 'Vị trí đề xuất phải khác với vị trí hoạt động hiện tại.');
    }
  }

  const created = await locationChangeRepo.createRequest({
    userId,
    partnerType,
    reason,
    currentLocationId: current?.locationId,
    currentAddress: current?.address,
    currentCity: current?.city,
    currentLat: current?.lat,
    currentLng: current?.lng,
    proposedAddress,
    proposedCity,
    proposedLat,
    proposedLng,
    proposedLocationSource: payload.locationSource || 'VIETMAP_PLACE',
    proposedProviderRefId: payload.providerRefId || '',
  });

  await writeAudit({
    actorId: userId,
    actorRole: partnerType,
    action: AUDIT_ACTION.PROFILE_UPDATE,
    entityType: 'LocationChangeRequest',
    entityId: created.id,
    meta: {
      proposedAddress,
      proposedLat,
      proposedLng,
      reason,
    },
  }).catch(() => null);

  return created;
}

async function getPartnerRequests(userId, partnerType) {
  return locationChangeRepo.findRequestsByPartner(userId, partnerType);
}

async function adminListRequests(query) {
  return locationChangeRepo.adminListRequests(query);
}

async function adminGetRequest(id) {
  const reqObj = await locationChangeRepo.findRequestById(id);
  if (!reqObj) throw new ApiError(404, 'Không tìm thấy yêu cầu thay đổi vị trí');
  return reqObj;
}

async function adminApproveRequest(requestId, adminId, adminNote = '') {
  const approved = await locationChangeRepo.approveLocationChange(requestId, adminId, adminNote);

  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.ADMIN_APPROVE,
    entityType: 'LocationChangeRequest',
    entityId: requestId,
    meta: { adminNote },
  }).catch(() => null);

  if (approved.user?.id) {
    await notify({
      userId: approved.user.id,
      title: 'Vị trí hoạt động đã được phê duyệt',
      message: 'Yêu cầu thay đổi vị trí hoạt động của bạn đã được Quản trị viên chấp thuận.',
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link: '/dashboard',
    }).catch(() => null);
  }

  return approved;
}

async function adminRejectRequest(requestId, adminId, reason) {
  const rejected = await locationChangeRepo.rejectLocationChange(requestId, adminId, reason);

  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.ADMIN_REJECT,
    entityType: 'LocationChangeRequest',
    entityId: requestId,
    meta: { reason },
  }).catch(() => null);

  if (rejected.user?.id) {
    await notify({
      userId: rejected.user.id,
      title: 'Yêu cầu đổi vị trí bị từ chối',
      message: `Yêu cầu thay đổi vị trí của bạn đã bị từ chối. Lý do: ${reason}`,
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link: '/dashboard',
    }).catch(() => null);
  }

  return rejected;
}

module.exports = {
  LOCATION_CHANGE_COOLDOWN_DAYS,
  LOCATION_CHANGE_COOLDOWN_MS,
  checkEligibility,
  requestLocationChange,
  getPartnerRequests,
  adminListRequests,
  adminGetRequest,
  adminApproveRequest,
  adminRejectRequest,
};
