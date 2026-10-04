const { Store, STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Material } = require('../models/Material');
const { Service } = require('../models/Service');
const { ApiError } = require('../utils/ApiError');
const { assertDeliveryPolicy } = require('../utils/delivery-policy');
const { toGeoPoint } = require('../utils/geo');

function applyGeo(payload) {
  const data = { ...payload };
  delete data.locationConfirmed;
  if (payload.lng !== undefined && payload.lat !== undefined) {
    const point = toGeoPoint(payload.lat, payload.lng);
    if (!point) throw new ApiError(422, 'Coordinates are invalid');
    data.location = point;
    data.locationConfirmed = true;
  }
  delete data.lng;
  delete data.lat;
  return data;
}

async function getStore(contractorId) {
  const store = await Store.findOne({ contractorId });
  return store ? store.toPublic() : null;
}

async function isApprovedOwner(ownerId) {
  const profile = await ContractorProfile.findOne({ userId: ownerId });
  return profile?.verificationStatus === VERIFICATION_STATUS.APPROVED;
}

function keptActivation(store, approved) {
  if (!approved) return STORE_STATUS.DRAFT;
  if (store?.status === STORE_STATUS.LIVE || store?.status === STORE_STATUS.PAUSED) return store.status;
  return STORE_STATUS.INACTIVE;
}

async function enforceStoreType(ownerId, lockedType) {
  const store = await Store.findOne({ contractorId: ownerId });
  if (!store) return null;
  const approved = await isApprovedOwner(ownerId);
  store.storeType = lockedType;
  store.status = keptActivation(store, approved);
  store.verified = approved;
  await store.save();
  await separateCatalog(store);
  return store.toPublic();
}

async function syncOwnerStore(ownerId, lockedType, fields) {
  const approved = await isApprovedOwner(ownerId);
  let store = await Store.findOne({ contractorId: ownerId });
  const patch = {
    name: fields.name,
    address: fields.address,
    city: fields.city || 'Can Tho',
    description: fields.description || '',
    storeType: lockedType,
    status: keptActivation(store, approved),
    verified: approved,
  };
  if (!store) {
    store = await Store.create({ contractorId: ownerId, ...patch });
  } else {
    if (!store.publicSeeded) {
      store.name = patch.name || store.name;
      store.address = patch.address || store.address;
      store.city = patch.city;
      store.description = patch.description;
    }
    store.storeType = lockedType;
    store.status = patch.status;
    store.verified = patch.verified;
    await store.save();
  }
  await separateCatalog(store);
  return store.toPublic();
}

async function lockStoreType(ownerId, payload, lockedType) {
  const data = applyGeo(payload);
  delete data.status;
  if (!lockedType) return data;
  if (data.storeType && data.storeType !== lockedType) {
    throw new ApiError(
      403,
      lockedType === STORE_TYPE.SERVICES
        ? 'Contractors manage repair services only'
        : 'Material stores manage materials only'
    );
  }
  data.storeType = lockedType;
  data.verified = await isApprovedOwner(ownerId);
  return data;
}

async function separateCatalog(store) {
  if (store.storeType === STORE_TYPE.SERVICES) {
    await Material.deleteMany({ storeId: store._id });
  }
  if (store.storeType === STORE_TYPE.MATERIALS) {
    await Service.deleteMany({ storeId: store._id });
  }
}

async function createStore(contractorId, payload, lockedType) {
  const existing = await Store.findOne({ contractorId });
  if (existing) {
    throw new ApiError(409, 'This partner already has a storefront');
  }
  const approved = await isApprovedOwner(contractorId);
  const data = await lockStoreType(contractorId, payload, lockedType);
  assertDeliveryPolicy({ serviceRadiusKm: 5, freeDeliveryRadiusKm: 0 }, data);
  const store = await Store.create({
    contractorId,
    ...data,
    status: approved ? STORE_STATUS.INACTIVE : STORE_STATUS.DRAFT,
  });
  await separateCatalog(store);
  return store.toPublic();
}

async function updateStore(contractorId, payload, lockedType) {
  const store = await Store.findOne({ contractorId });
  if (!store) {
    throw new ApiError(404, 'Storefront not found');
  }
  const data = await lockStoreType(contractorId, payload, lockedType);
  assertDeliveryPolicy(store, data);
  store.set(data);
  await store.save();
  await separateCatalog(store);
  return store.toPublic();
}

async function deleteStore(contractorId) {
  const store = await Store.findOneAndDelete({ contractorId });
  if (!store) {
    throw new ApiError(404, 'Storefront not found');
  }
  return { deleted: true, id: store._id };
}

module.exports = { getStore, enforceStoreType, syncOwnerStore, createStore, updateStore, deleteStore };
