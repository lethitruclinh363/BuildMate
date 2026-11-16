const { REQUEST_STATUS } = require('../models/RepairRequest');
const { RepairRequest, ChatRoom } = require('../repositories/conversationAccess');
const { STORE_STATUS, STORE_TYPE } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Store, ContractorProfile, loadUser, findUsersByIds } = require('../repositories/partnerAccess');
const { ApiError } = require('../utils/ApiError');
const { createRoomForRequest } = require('./chatService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { LIVE_CATALOG_STATUSES } = require('../models/CatalogService');
const { CatalogService } = require('../repositories/offeringAccess');
const { requirePlace } = require('../utils/geo');
const locationCorrection = require('./locationCorrection.service');

const REPLAY_WINDOW_MS = 45 * 1000;
const replayLocks = new Map();

function replayFingerprint(customerId, payload = {}) {
  const title = String(payload.title || '').trim().toLowerCase();
  const description = String(payload.description || '').trim().toLowerCase();
  const catalog = String(payload.catalogServiceId || payload.category || '').trim().toLowerCase();
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const pin = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)},${lng.toFixed(5)}` : '';
  return [String(customerId), String(payload.contractorId || ''), catalog, title, description, pin].join('|');
}

function isReplayOf(row, payload, now = Date.now()) {
  if (!row?.createdAt) return false;
  if (now - new Date(row.createdAt).getTime() > REPLAY_WINDOW_MS) return false;
  const sameTitle = String(row.title || '').trim() === String(payload.title || '').trim();
  const sameBody = String(row.description || '').trim() === String(payload.description || '').trim();
  const catalog = String(payload.catalogServiceId || '').trim();
  const sameCatalog = !catalog || String(row.catalogServiceId || '').trim() === catalog;
  return sameTitle && sameBody && sameCatalog;
}

async function withReplayLock(key, work) {
  const pending = replayLocks.get(key);
  if (pending) return pending;
  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      replayLocks.delete(key);
    });
  replayLocks.set(key, next);
  return next;
}

async function findRecentDuplicate(customerId, contractorId, payload) {
  const rows = await RepairRequest.find({ customerId, contractorId }).sort({ createdAt: -1 }).limit(8);
  return rows.find((row) => isReplayOf(row, payload)) || null;
}

async function populateCards(requests) {
  const list = requests.filter(Boolean);
  if (!list.length) return [];
  const userIds = [...new Set(list.flatMap((row) => [row.customerId, row.contractorId].filter(Boolean).map(String)))];
  const storeIds = [...new Set(list.map((row) => row.storeId).filter(Boolean).map(String))];
  const requestIds = list.map((row) => row._id).filter(Boolean);
  const [users, stores, rooms] = await Promise.all([
    findUsersByIds(userIds),
    storeIds.length ? Store.find({ _id: { $in: storeIds } }) : [],
    requestIds.length ? ChatRoom.find({ requestId: { $in: requestIds } }) : [],
  ]);
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const storeById = new Map(stores.map((store) => [String(store._id), store]));
  const roomByRequest = new Map(rooms.map((room) => [String(room.requestId), room]));
  return list.map((request) => ({
    ...request.toPublic(),
    customer: userById.get(String(request.customerId))?.toPublic() || null,
    contractor: userById.get(String(request.contractorId))?.toPublic() || null,
    store: request.storeId ? storeById.get(String(request.storeId))?.toPublic() || null : null,
    roomId: roomByRequest.get(String(request._id))?._id || null,
  }));
}

async function populateCard(request) {
  const [card] = await populateCards([request]);
  return card;
}

async function createRequest(customerId, payload) {
  const contractor = await loadUser(payload.contractorId);
  if (!contractor || contractor.role !== 'CONTRACTOR') {
    throw new ApiError(404, 'Contractor not found');
  }
  const profile = await ContractorProfile.findOne({
    userId: contractor._id,
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  });
  if (!profile) throw new ApiError(400, 'This partner is not verified yet');
  const activationService = require('./activation.service');
  const readiness = await activationService.getActivationReadiness(contractor._id);
  if (!readiness.visible) throw new ApiError(400, 'This partner is not accepting new requests');

  if (payload.storeId) {
    const requested = await Store.findById(payload.storeId);
    if (
      requested &&
      (requested.storeType === STORE_TYPE.MATERIALS ||
        String(requested.contractorId) !== String(contractor._id))
    ) {
      throw new ApiError(400, 'Material stores cannot receive repair requests');
    }
  }

  const store = await Store.findOne({
    contractorId: contractor._id,
    status: STORE_STATUS.LIVE,
    storeType: STORE_TYPE.SERVICES,
  });

  const serviceService = require('./serviceService');
  const offering = await serviceService.assertContractorOffersCatalog(contractor._id, payload.catalogServiceId);
  const publicOffering = typeof offering.toPublic === 'function' ? offering.toPublic() : offering;
  let category = publicOffering.category || payload.category;
  let serviceName = publicOffering.name || payload.serviceName || '';
  let catalogServiceId = publicOffering.catalogKey || String(publicOffering.id || offering._id || '');
  if (catalogServiceId) {
    const query = /^[a-f0-9]{24}$/i.test(catalogServiceId) ? { _id: catalogServiceId } : { code: catalogServiceId };
    const catalog = await CatalogService.findOne({ ...query, status: { $in: LIVE_CATALOG_STATUSES } });
    if (catalog) {
      category = catalog.category;
      serviceName = catalog.name;
      catalogServiceId = catalog.code || String(catalog._id);
    }
  }

  const site = requirePlace(
    { lat: payload.lat, lng: payload.lng, address: payload.address, label: payload.address },
    { addressMax: 300, labelMax: 300 }
  );
  if (!site) throw new ApiError(422, 'Coordinates are invalid');
  if (!locationCorrection.confirmedFlag(payload.locationConfirmed)) {
    throw new ApiError(422, 'Confirm the site location');
  }
  const confirmedAt = new Date();
  const createPayload = {
    ...payload,
    category,
    catalogServiceId,
  };

  return withReplayLock(replayFingerprint(customerId, createPayload), async () => {
    const recent = await findRecentDuplicate(customerId, contractor._id, createPayload);
    if (recent) {
      const room = await ChatRoom.findOne({ requestId: recent._id });
      return { ...(await populateCard(recent)), roomId: room?._id || null };
    }

    const request = await RepairRequest.create({
      customerId,
      contractorId: contractor._id,
      storeId: store?._id || null,
      category,
      serviceName,
      catalogServiceId,
      title: payload.title,
      description: payload.description,
      images: payload.images || [],
      videos: payload.videos || [],
      address: site.address,
      location: site.point,
      locationConfirmed: true,
      locationSource: locationCorrection.locationSourceOf(payload.locationSource),
      locationConfirmedAt: confirmedAt,
    });

    const room = await createRoomForRequest(request);
    await notify({
      userId: contractor._id,
      title: 'New repair request',
      message: `${payload.title} · ${payload.category}`,
      type: NOTIFICATION_TYPE.REQUEST,
      link: `/contractor/requests/${request._id}`,
      meta: { requestId: String(request._id), roomId: String(room._id) },
    });

    return { ...(await populateCard(request)), roomId: room._id };
  });
}

async function listMine(customerId) {
  const rows = await RepairRequest.find({ customerId }).sort({ createdAt: -1 });
  return populateCards(rows);
}

async function listReceived(contractorId) {
  const rows = await RepairRequest.find({ contractorId }).sort({ createdAt: -1 });
  return populateCards(rows);
}

async function getById(id, user) {
  const request = await RepairRequest.findById(id);
  if (!request) throw new ApiError(404, 'Repair request not found');
  const uid = String(user.id);
  if (String(request.customerId) !== uid && String(request.contractorId) !== uid) {
    throw new ApiError(403, 'You cannot view this request');
  }
  return populateCard(request);
}

async function claimPendingRequest(id, contractorId, status) {
  if (typeof RepairRequest.claimPending === 'function') {
    return RepairRequest.claimPending(id, contractorId, status);
  }
  return RepairRequest.findOneAndUpdate(
    { _id: id, contractorId, status: REQUEST_STATUS.PENDING },
    { status },
    { new: true }
  );
}

async function claimCustomerPending(id, customerId, status) {
  if (typeof RepairRequest.claimCustomerPending === 'function') {
    return RepairRequest.claimCustomerPending(id, customerId, status);
  }
  return RepairRequest.findOneAndUpdate(
    { _id: id, customerId, status: REQUEST_STATUS.PENDING },
    { status },
    { new: true }
  );
}

async function cancelPending(id, customerId) {
  const request = await claimCustomerPending(id, customerId, REQUEST_STATUS.CANCELLED);
  if (!request) {
    const existing = await RepairRequest.findById(id);
    if (!existing) throw new ApiError(404, 'Repair request not found');
    if (String(existing.customerId) !== String(customerId)) {
      throw new ApiError(403, 'You cannot cancel this request');
    }
    if (existing.status === REQUEST_STATUS.CANCELLED) {
      throw new ApiError(409, 'This request is already cancelled');
    }
    throw new ApiError(409, 'This request is no longer pending');
  }
  await notify({
    userId: request.contractorId,
    title: 'Request cancelled',
    message: request.title,
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: '/contractor/requests',
    meta: { requestId: String(request._id), status: REQUEST_STATUS.CANCELLED },
  });
  await writeAudit({
    actorId: customerId,
    actorRole: 'CUSTOMER',
    action: AUDIT_ACTION.REQUEST_STATUS,
    entityType: 'RepairRequest',
    entityId: request._id,
    meta: { status: REQUEST_STATUS.CANCELLED },
  });
  return populateCard(request);
}

async function setStatus(id, contractorId, status) {
  if (![REQUEST_STATUS.ACCEPTED, REQUEST_STATUS.REJECTED].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }
  const request = await claimPendingRequest(id, contractorId, status);
  if (!request) {
    const existing = await RepairRequest.findOne({ _id: id, contractorId });
    if (!existing) throw new ApiError(404, 'Repair request not found');
    throw new ApiError(409, 'This request is no longer pending');
  }
  const room = await ChatRoom.findOne({ requestId: request._id });
  await notify({
    userId: request.customerId,
    title: status === REQUEST_STATUS.ACCEPTED ? 'Request accepted' : 'Request declined',
    message: request.title,
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: room ? `/customer/chat/${room._id}` : '/customer/request/history',
    meta: { requestId: String(request._id), status },
  });
  await writeAudit({
    actorId: contractorId,
    actorRole: 'CONTRACTOR',
    action: AUDIT_ACTION.REQUEST_STATUS,
    entityType: 'RepairRequest',
    entityId: request._id,
    meta: { status },
  });
  return populateCard(request);
}

module.exports = {
  createRequest,
  listMine,
  listReceived,
  getById,
  setStatus,
  cancelPending,
  replayFingerprint,
  isReplayOf,
  REPLAY_WINDOW_MS,
};
