const { REQUEST_STATUS, REPAIR_CATEGORY } = require('../models/RepairRequest');
const { RepairRequest, ChatRoom } = require('../repositories/conversationAccess');
const { STORE_STATUS, STORE_TYPE } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Store, ContractorProfile, loadUser, findUsersByIds } = require('../repositories/partnerAccess');
const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { createRoomForRequest } = require('./chatService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { LIVE_CATALOG_STATUSES } = require('../models/CatalogService');
const { CatalogService } = require('../repositories/offeringAccess');
const { requirePlace } = require('../utils/geo');
const locationCorrection = require('./locationCorrection.service');

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
  let category = payload.category;
  let serviceName = payload.serviceName || '';
  let catalogServiceId = payload.catalogServiceId || '';
  if (catalogServiceId) {
    const query = /^[a-f0-9]{24}$/i.test(catalogServiceId) ? { _id: catalogServiceId } : { code: catalogServiceId };
    const catalog = await CatalogService.findOne({ ...query, status: { $in: LIVE_CATALOG_STATUSES } });
    if (!catalog) throw new ApiError(400, 'This service cannot be registered.');
    category = catalog.category;
    serviceName = catalog.name;
    catalogServiceId = catalog.code || String(catalog._id);
  } else if (!Object.values(REPAIR_CATEGORY).includes(category)) {
    throw new ApiError(400, 'Select a valid service');
  }
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

  const site = requirePlace(
    { lat: payload.lat, lng: payload.lng, address: payload.address, label: payload.address },
    { addressMax: 300, labelMax: 300 }
  );
  if (!site) throw new ApiError(422, 'Coordinates are invalid');
  if (!locationCorrection.confirmedFlag(payload.locationConfirmed)) {
    throw new ApiError(422, 'Confirm the site location');
  }
  const confirmedAt = new Date();

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
  if (env.databaseProvider !== 'postgres') {
    await locationCorrection.record({
      address: site.address,
      lat: site.lat,
      lng: site.lng,
      refId: payload.providerRefId,
    }).catch(() => null);
  }

  const room = await createRoomForRequest(request);
  await notify({
    userId: contractor._id,
    title: 'New repair request',
    message: `${payload.title} · ${payload.category}`,
    type: NOTIFICATION_TYPE.REQUEST,
    link: `/contractor/requests`,
    meta: { requestId: String(request._id), roomId: String(room._id) },
  });

  return { ...(await populateCard(request)), roomId: room._id };
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

async function setStatus(id, contractorId, status) {
  if (![REQUEST_STATUS.ACCEPTED, REQUEST_STATUS.REJECTED].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }
  const request = await RepairRequest.findOne({ _id: id, contractorId });
  if (!request) throw new ApiError(404, 'Repair request not found');
  if (request.status !== REQUEST_STATUS.PENDING) {
    throw new ApiError(409, 'This request is no longer pending');
  }
  request.status = status;
  await request.save();
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

module.exports = { createRequest, listMine, listReceived, getById, setStatus };
