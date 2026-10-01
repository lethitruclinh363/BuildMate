const { RepairRequest, REQUEST_STATUS, REPAIR_CATEGORY } = require('../models/RepairRequest');
const { Store, STORE_STATUS, STORE_TYPE } = require('../models/Store');
const { User } = require('../models/User');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ChatRoom } = require('../models/ChatRoom');
const { ApiError } = require('../utils/ApiError');
const { createRoomForRequest } = require('./chat.service');
const { notify, NOTIFICATION_TYPE } = require('./notification.service');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');
const { CatalogService, LIVE_CATALOG_STATUSES } = require('../models/CatalogService');

async function populateCard(request) {
  const [customer, contractor, store, room] = await Promise.all([
    User.findById(request.customerId),
    User.findById(request.contractorId),
    request.storeId ? Store.findById(request.storeId) : null,
    ChatRoom.findOne({ requestId: request._id }),
  ]);
  return {
    ...request.toPublic(),
    customer: customer ? customer.toPublic() : null,
    contractor: contractor ? contractor.toPublic() : null,
    store: store ? store.toPublic() : null,
    roomId: room ? room._id : null,
  };
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
  const contractor = await User.findById(payload.contractorId);
  if (!contractor || contractor.role !== 'CONTRACTOR') {
    throw new ApiError(404, 'Contractor not found');
  }
  const profile = await ContractorProfile.findOne({
    userId: contractor._id,
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  });
  if (!profile) throw new ApiError(400, 'This partner is not verified yet');

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

  const lng = payload.lng !== undefined ? Number(payload.lng) : store?.location?.coordinates?.[0];
  const lat = payload.lat !== undefined ? Number(payload.lat) : store?.location?.coordinates?.[1];

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
    address: payload.address || '',
    location: {
      type: 'Point',
      coordinates: [Number.isFinite(lng) ? lng : 105.746, Number.isFinite(lat) ? lat : 10.045],
    },
  });

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
  return Promise.all(rows.map(populateCard));
}

async function listReceived(contractorId) {
  const rows = await RepairRequest.find({ contractorId }).sort({ createdAt: -1 });
  return Promise.all(rows.map(populateCard));
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
