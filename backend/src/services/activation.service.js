const { STORE_STATUS, STORE_TYPE } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { USER_STATUS, ROLES } = require('../models/User');
const { ContractorProfile, Store, loadUser } = require('../repositories/partnerAccess');
const { Service, Material } = require('../repositories/offeringAccess');
const { ApiError } = require('../utils/ApiError');
// const { publicPricedServiceMatch } = require('../constants/contractor-services');
const { publicPricedServiceMatch } = require('../constants/contractorServices');
const materialCategoryService = require('./material-category.service');
const { fromGeoPoint } = require('../utils/geo');

const BLOCKED_ACCOUNTS = new Set([USER_STATUS.BLOCKED, USER_STATUS.BANNED]);

function activationStatusOf(status) {
  if (status === STORE_STATUS.LIVE) return 'LIVE';
  if (status === STORE_STATUS.PAUSED) return 'PAUSED';
  return 'INACTIVE';
}

function isPartnerPubliclyVisible(partner) {
  return (
    partner?.verificationStatus === VERIFICATION_STATUS.APPROVED &&
    partner?.activationStatus === 'LIVE' &&
    !BLOCKED_ACCOUNTS.has(partner?.accountStatus) &&
    partner?.profileReady === true
  );
}

function hasValidLocation(store) {
  const point = fromGeoPoint(store?.location);
  if (!point || (point.lat === 0 && point.lng === 0)) return false;
  return store?.locationConfirmed === true;
}

function partnerKind(user, store) {
  if (user?.role === ROLES.MATERIAL_STORE_OWNER || store?.storeType === STORE_TYPE.MATERIALS) return 'STORE';
  return 'CONTRACTOR';
}

function evaluateReadiness({ kind, profile, store, user, serviceCount = 0, productCount = 0, categoryCount = 0, priceCount = 0 }) {
  const approved = profile?.verificationStatus === VERIFICATION_STATUS.APPROVED;
  const blocked = BLOCKED_ACCOUNTS.has(user?.status);
  const name = String(store?.name || '').trim().length >= 2;
  const portrait = Boolean(String(store?.avatar || '').trim() || String(store?.logo || '').trim());
  const description = String(store?.description || '').trim().length >= 8;
  const hours = String(store?.openingHours || '').trim().length >= 3;
  const areas = Array.isArray(store?.serviceAreas) ? store.serviceAreas.length : 0;
  const place = String(store?.address || '').trim().length >= 2 || String(store?.city || '').trim().length >= 2 || areas > 0;
  const address = String(store?.address || '').trim().length >= 2;
  const phone = String(store?.phone || '').trim().length >= 8;
  const cover = Boolean(String(store?.coverImage || '').trim() || (Array.isArray(store?.gallery) && store.gallery.length) || store?.hasGallery);
  const location = hasValidLocation(store);
  const checks =
    kind === 'STORE'
      ? [
          { key: 'verification', ok: approved && !blocked },
          { key: 'name', ok: name },
          { key: 'portrait', ok: portrait },
          { key: 'cover', ok: cover },
          { key: 'description', ok: description },
          { key: 'address', ok: address },
          { key: 'categories', ok: categoryCount >= 1 },
          { key: 'products', ok: productCount >= 1 },
          { key: 'prices', ok: priceCount >= 1 },
          { key: 'hours', ok: hours },
          { key: 'location', ok: location },
          { key: 'contact', ok: phone },
        ]
      : [
          { key: 'verification', ok: approved && !blocked },
          { key: 'name', ok: name },
          { key: 'portrait', ok: portrait },
          { key: 'description', ok: description },
          { key: 'place', ok: place },
          { key: 'hours', ok: hours },
          { key: 'services', ok: serviceCount >= 1 },
          { key: 'location', ok: location },
          { key: 'contact', ok: phone },
        ];
  const done = checks.filter((item) => item.ok).length;
  const profileReady = checks.every((item) => item.ok);
  const activationStatus = activationStatusOf(store?.status);
  const snapshot = {
    verificationStatus: profile?.verificationStatus || 'DRAFT',
    activationStatus,
    accountStatus: user?.status || '',
    profileReady,
  };
  return {
    kind,
    checks,
    profileReady,
    percent: Math.round((done / checks.length) * 100),
    activationStatus,
    verificationStatus: snapshot.verificationStatus,
    visible: isPartnerPubliclyVisible(snapshot),
    ready: profileReady && approved && !blocked,
  };
}

async function materialStock(store) {
  if (typeof Material.countReadiness === 'function') return Material.countReadiness(store._id);
  const [productCount, priceCount] = await Promise.all([
    Material.countDocuments({ storeId: store._id, isActive: true }),
    Material.countDocuments({ storeId: store._id, isActive: true, price: { $gt: 0 } }),
  ]);
  return { productCount, priceCount };
}

async function getActivationReadiness(userId, loaded = {}) {
  const [user, profile, store] = await Promise.all([
    loadUser(userId),
    loaded.profile || ContractorProfile.findOne({ userId }),
    loaded.store !== undefined ? loaded.store : Store.findOne({ contractorId: userId }),
  ]);
  const kind = partnerKind(user, store);
  const [serviceCount, stock, categories] = await Promise.all([
    kind !== 'STORE' && store ? Service.countDocuments({ storeId: store._id, ...publicPricedServiceMatch() }) : 0,
    kind === 'STORE' && store ? materialStock(store) : { productCount: 0, priceCount: 0 },
    kind === 'STORE' && profile ? materialCategoryService.categoriesForProfile(profile) : [],
  ]);
  const productCount = stock.productCount;
  const priceCount = stock.priceCount;
  const result = evaluateReadiness({
    kind,
    profile,
    store,
    user,
    serviceCount,
    productCount,
    priceCount,
    categoryCount: categories.length,
  });
  return result;
}

async function countedServices(storeIds) {
  if (!storeIds.length) return new Map();
  if (typeof Service.countPublicByStores === 'function') return Service.countPublicByStores(storeIds);
  const rows = await Service.find({ storeId: { $in: storeIds }, ...publicPricedServiceMatch() }).select('storeId');
  const counts = new Map();
  for (const row of rows) {
    const key = String(row.storeId || '');
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

async function countedMaterials(storeIds) {
  if (!storeIds.length) return new Map();
  if (typeof Material.countStockByStores === 'function') return Material.countStockByStores(storeIds);
  const rows = await Material.find({ storeId: { $in: storeIds }, isActive: true }).select('storeId price');
  const counts = new Map();
  for (const row of rows) {
    const key = String(row.storeId || '');
    if (!key) continue;
    const current = counts.get(key) || { productCount: 0, priceCount: 0 };
    current.productCount += 1;
    if (Number(row.price) > 0) current.priceCount += 1;
    counts.set(key, current);
  }
  return counts;
}

async function readinessForLoaded(entries, categoriesByProfile = new Map()) {
  const serviceStoreIds = [];
  const materialStoreIds = [];
  for (const entry of entries) {
    entry.kind = partnerKind(entry.user, entry.store);
    if (!entry.store?._id) continue;
    const storeId = String(entry.store._id);
    if (entry.kind === 'STORE') materialStoreIds.push(storeId);
    else serviceStoreIds.push(storeId);
  }
  const [serviceCounts, materialCounts] = await Promise.all([
    countedServices(serviceStoreIds),
    countedMaterials(materialStoreIds),
  ]);
  const map = new Map();
  for (const entry of entries) {
    const storeId = entry.store?._id ? String(entry.store._id) : '';
    const stock = materialCounts.get(storeId) || { productCount: 0, priceCount: 0 };
    const categories = entry.profile ? categoriesByProfile.get(String(entry.profile._id)) : null;
    map.set(String(entry.userId), evaluateReadiness({
      kind: entry.kind,
      profile: entry.profile,
      store: entry.store,
      user: entry.user,
      serviceCount: entry.kind === 'STORE' ? 0 : serviceCounts.get(storeId) || 0,
      productCount: entry.kind === 'STORE' ? stock.productCount : 0,
      priceCount: entry.kind === 'STORE' ? stock.priceCount : 0,
      categoryCount: entry.kind === 'STORE' && categories ? categories.length : 0,
    }));
  }
  return map;
}

function cardIsPublic(card, catalog) {
  const kind = catalog === 'materials' ? 'STORE' : 'CONTRACTOR';
  const result = evaluateReadiness({
    kind,
    profile: { verificationStatus: card?.verified ? VERIFICATION_STATUS.APPROVED : 'DRAFT' },
    store: {
      name: card?.businessName || card?.storeName,
      avatar: card?.avatar,
      logo: card?.logo,
      coverImage: card?.coverImage,
      hasGallery: card?.hasGallery,
      description: card?.description,
      address: card?.address,
      city: card?.city,
      serviceAreas: card?.serviceAreas,
      openingHours: card?.openingHours,
      phone: card?.phone,
      location: card?.location,
      locationConfirmed: card?.locationConfirmed === true,
      status: STORE_STATUS.LIVE,
    },
    user: { status: card?.accountStatus || USER_STATUS.ACTIVE },
    serviceCount: (card?.services || []).length,
    productCount: (card?.products || []).length,
    priceCount: (card?.products || []).filter((item) => Number(item.price) > 0).length,
    categoryCount: (card?.materialCategories || []).length,
  });
  return result.visible;
}

function rowIsPublic(row, kind) {
  const result = evaluateReadiness({
    kind,
    profile: row?.profile,
    store: row?.storeDoc,
    user: row?.owner,
    serviceCount: kind === 'CONTRACTOR' ? 1 : 0,
    productCount: kind === 'STORE' ? 1 : 0,
    priceCount: Number(row?.price) > 0 ? 1 : 0,
    categoryCount: Array.isArray(row?.profile?.materialCategories) ? row.profile.materialCategories.length : 0,
  });
  return result.visible;
}

async function activate(userId) {
  const readiness = await getActivationReadiness(userId);
  if (readiness.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(403, 'Only an approved partner can activate');
  }
  if (!readiness.profileReady) {
    throw new ApiError(409, 'Complete the public profile before activating');
  }
  const store = await Store.findOne({ contractorId: userId });
  if (!store) throw new ApiError(404, 'Storefront not found');
  store.status = STORE_STATUS.LIVE;
  store.verified = true;
  await store.save();
  return getActivationReadiness(userId);
}

async function pause(userId) {
  const profile = await ContractorProfile.findOne({ userId });
  if (profile?.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(403, 'Only an approved partner can pause');
  }
  const store = await Store.findOne({ contractorId: userId });
  if (!store) throw new ApiError(404, 'Storefront not found');
  if (store.status !== STORE_STATUS.LIVE) {
    throw new ApiError(409, 'Only a live partner can pause');
  }
  store.status = STORE_STATUS.PAUSED;
  await store.save();
  return getActivationReadiness(userId);
}

module.exports = {
  activationStatusOf,
  hasValidLocation,
  isPartnerPubliclyVisible,
  evaluateReadiness,
  getActivationReadiness,
  readinessForLoaded,
  cardIsPublic,
  rowIsPublic,
  activate,
  pause,
};
