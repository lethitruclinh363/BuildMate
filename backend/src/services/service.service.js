const { Service } = require('../models/Service');
const { Store, STORE_TYPE } = require('../models/Store');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { CatalogService, CATALOG_STATUS, LIVE_CATALOG_STATUSES } = require('../models/CatalogService');
const { ApiError } = require('../utils/ApiError');
const catalogService = require('./catalog.service');
const {
  collapseServiceName,
  findSystemService,
  offeringIdentity,
  matchesCatalogName,
  isCategory,
} = require('../constants/contractor-services');

async function assertServiceStore(storeId) {
  const store = await Store.findById(storeId);
  if (!store || store.storeType === STORE_TYPE.MATERIALS) {
    throw new ApiError(403, 'Material stores cannot publish repair services');
  }
  return store;
}

function pendingProposals(profile, offerings) {
  const linked = new Set(offerings.map((item) => item.catalogKey).filter(Boolean));
  return (profile?.services || [])
    .filter((item) => item.type === 'CUSTOM' && item.status === 'PENDING_APPROVAL' && item.serviceId && !linked.has(String(item.serviceId)))
    .map((item) => ({
      id: `pending-${item.serviceId}`,
      name: item.name,
      category: item.category,
      description: '',
      catalogKey: String(item.serviceId),
      catalogType: 'CUSTOM',
      completionStatus: 'PENDING_APPROVAL',
      basePrice: null,
      unit: 'JOB',
      estimatedHours: null,
      image: '',
      images: [],
      priceRange: null,
      isActive: false,
    }));
}

async function ensureContractorOfferings(store, profile) {
  const existing = await Service.find({ storeId: store._id });
  for (const item of profile?.services || []) {
    const identity = offeringIdentity(item);
    if (!identity) continue;
    let row = existing.find((entry) => entry.catalogKey && entry.catalogKey === identity.catalogKey);
    if (!row) {
      row = existing.find((entry) => !entry.catalogKey && matchesCatalogName(entry.name, identity));
      if (row) {
        row.catalogKey = identity.catalogKey;
        row.catalogType = identity.catalogType;
        row.name = identity.name;
        row.category = identity.category;
        if (!(Number(row.basePrice) > 0)) {
          row.completionStatus = 'INCOMPLETE';
          row.isActive = false;
        } else if (row.completionStatus !== 'INCOMPLETE') {
          row.completionStatus = 'COMPLETED';
        }
        await row.save();
        continue;
      }
    }
    if (row) continue;
    try {
      const created = await Service.create({
        storeId: store._id,
        contractorId: store.contractorId,
        name: identity.name,
        category: identity.category,
        catalogKey: identity.catalogKey,
        catalogType: identity.catalogType,
        description: '',
        unit: 'JOB',
        isActive: false,
        completionStatus: 'INCOMPLETE',
      });
      existing.push(created);
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  return existing;
}

async function rememberProfileService(userId, identity, status) {
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile) return;
  const exists = (profile.services || []).some((item) => {
    if (identity.catalogType === 'CUSTOM') return String(item.serviceId || '') === identity.catalogKey;
    return offeringIdentity(item)?.catalogKey === identity.catalogKey;
  });
  if (exists) return;
  profile.services.push({
    category: identity.category,
    name: identity.name,
    type: identity.catalogType === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
    serviceId: identity.catalogKey,
    status,
  });
  profile.markModified('services');
  await profile.save();
}

async function resolveCatalogKey(catalogKey) {
  const key = String(catalogKey || '');
  const system = findSystemService(key) || findSystemService(key.split('::').pop());
  let doc = null;
  if (/^[a-f0-9]{24}$/i.test(key)) doc = await CatalogService.findById(key).catch(() => null);
  if (!doc && system) doc = await CatalogService.findOne({ code: `${system.category}::${system.name}` });
  if (!doc) doc = await CatalogService.findOne({ code: key });
  if (!doc && system && (`${system.category}::${system.name}` === key || system.name === key)) {
    return {
      catalogKey: `${system.category}::${system.name}`,
      catalogType: 'SYSTEM',
      name: system.name,
      category: system.category,
    };
  }
  if (!doc) throw new ApiError(400, 'Register a service from the BuildMate catalog.');
  if (doc.status === CATALOG_STATUS.PENDING_APPROVAL) {
    throw new ApiError(409, 'This service is waiting for admin approval.');
  }
  if (!LIVE_CATALOG_STATUSES.includes(doc.status)) {
    throw new ApiError(400, 'This service cannot be registered.');
  }
  const stableKey = doc.code || String(doc._id);
  return {
    catalogKey: stableKey,
    catalogType: doc.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
    name: doc.code ? doc.code.split('::').pop() : doc.name,
    category: doc.category,
  };
}

async function listServices(storeId, contractorId) {
  const store = await assertServiceStore(storeId);
  const profile = await ContractorProfile.findOne({ userId: contractorId || store.contractorId });
  if (profile?.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    await catalogService.syncCustomStatuses(profile);
    await ensureContractorOfferings(store, profile);
  }
  const items = await Service.find({ storeId: store._id }).sort({ createdAt: 1 });
  return [...items.map((item) => item.toPublic()), ...pendingProposals(profile, items)];
}

async function registerService(storeId, contractorId, catalogKey) {
  const store = await assertServiceStore(storeId);
  const identity = await resolveCatalogKey(catalogKey);
  const existing = await Service.findOne({ storeId: store._id, catalogKey: identity.catalogKey });
  if (existing) return existing.toPublic();
  let created;
  try {
    created = await Service.create({
      storeId: store._id,
      contractorId,
      name: identity.name,
      category: identity.category,
      catalogKey: identity.catalogKey,
      catalogType: identity.catalogType,
      description: '',
      unit: 'JOB',
      isActive: false,
      completionStatus: 'INCOMPLETE',
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const raced = await Service.findOne({ storeId: store._id, catalogKey: identity.catalogKey });
    if (!raced) throw err;
    return raced.toPublic();
  }
  await rememberProfileService(contractorId, identity, 'APPROVED');
  return created.toPublic();
}

async function updateService(storeId, id, payload) {
  await assertServiceStore(storeId);
  const item = await Service.findOne({ _id: id, storeId });
  if (!item) throw new ApiError(404, 'Service not found');
  if (payload.name && collapseServiceName(payload.name) !== collapseServiceName(item.name)) {
    throw new ApiError(400, 'Register a service from the BuildMate catalog.');
  }
  if (payload.category && payload.category !== item.category) {
    throw new ApiError(400, 'Register a service from the BuildMate catalog.');
  }
  const price = Number(payload.basePrice);
  if (!(price > 0)) throw new ApiError(400, 'Enter a base price');
  item.basePrice = price;
  if (payload.unit) item.unit = payload.unit;
  if (payload.estimatedHours) item.estimatedHours = payload.estimatedHours;
  if (payload.description !== undefined) item.description = payload.description;
  if (payload.image !== undefined) item.image = payload.image;
  item.completionStatus = 'COMPLETED';
  item.isActive = true;
  item.priceRange = { min: price, max: price };
  if (!item.catalogType) item.catalogType = 'LEGACY';
  await item.save();
  return item.toPublic();
}

async function deleteService(storeId, id) {
  await assertServiceStore(storeId);
  const item = await Service.findOne({ _id: id, storeId });
  if (!item) throw new ApiError(404, 'Service not found');
  if (item.catalogKey) {
    throw new ApiError(400, 'Register a service from the BuildMate catalog.');
  }
  await item.deleteOne();
  return { deleted: true, id };
}

async function attachCustomProposal(userId, proposal) {
  if (!proposal?.serviceId || !isCategory(proposal.category)) return proposal;
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile) return proposal;
  const exists = (profile.services || []).some((item) => String(item.serviceId || '') === String(proposal.serviceId));
  if (!exists) {
    profile.services.push({
      category: proposal.category,
      name: proposal.name,
      type: 'CUSTOM',
      serviceId: String(proposal.serviceId),
      status: proposal.status || 'PENDING_APPROVAL',
    });
    profile.markModified('services');
    await profile.save();
  }
  return proposal;
}

module.exports = {
  listServices,
  registerService,
  updateService,
  deleteService,
  ensureContractorOfferings,
  attachCustomProposal,
};
