const { Store, STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Material } = require('../models/Material');
const { Service } = require('../models/Service');
const { ApiError } = require('../utils/ApiError');

function applyGeo(payload) {
  const data = { ...payload };
  if (payload.lng !== undefined && payload.lat !== undefined) {
    data.location = { type: 'Point', coordinates: [payload.lng, payload.lat] };
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

async function enforceStoreType(ownerId, lockedType) {
  const store = await Store.findOne({ contractorId: ownerId });
  if (!store) return null;
  const approved = await isApprovedOwner(ownerId);
  store.storeType = lockedType;
  store.status = approved ? STORE_STATUS.LIVE : STORE_STATUS.DRAFT;
  store.verified = approved;
  await store.save();
  await separateCatalog(store);
  return store.toPublic();
}

async function syncOwnerStore(ownerId, lockedType, fields) {
  const approved = await isApprovedOwner(ownerId);
  const patch = {
    name: fields.name,
    address: fields.address,
    city: fields.city || 'Can Tho',
    description: fields.description || '',
    storeType: lockedType,
    status: approved ? STORE_STATUS.LIVE : STORE_STATUS.DRAFT,
    verified: approved,
  };
  let store = await Store.findOne({ contractorId: ownerId });
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
  const approved = await isApprovedOwner(ownerId);
  data.status = approved ? STORE_STATUS.LIVE : STORE_STATUS.DRAFT;
  data.verified = approved;
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
  const store = await Store.create({ contractorId, ...(await lockStoreType(contractorId, payload, lockedType)) });
  await separateCatalog(store);
  return store.toPublic();
}

async function updateStore(contractorId, payload, lockedType) {
  const data = await lockStoreType(contractorId, payload, lockedType);
  const store = await Store.findOneAndUpdate({ contractorId }, data, {
    new: true,
    runValidators: true,
  });
  if (!store) {
    throw new ApiError(404, 'Storefront not found');
  }
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
