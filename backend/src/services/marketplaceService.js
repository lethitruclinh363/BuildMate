const { STORE_STATUS } = require('../models/Store');
const { Service, Material, CatalogService } = require('../repositories/offeringAccess');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ContractorProfile, Store } = require('../repositories/partnerAccess');
const { ApiError } = require('../utils/ApiError');
const { publicPricedServiceMatch, foldServiceName } = require('../constants/contractorServices');
const { presentPublicProfile, seedPublicProfile, seedMaterialPublicProfile, loadPublicHighlights } = require('./publicProfileService');
const reviewService = require('./reviewService');
const reputationService = require('./reputationService');
const { LIVE_CATALOG_STATUSES } = require('../models/CatalogService');
const activationService = require('./activation.service');
const { USER_STATUS } = require('../models/User');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertApprovedLiveStore(storeId) {
  const store = await Store.findOne({ _id: storeId, status: STORE_STATUS.LIVE });
  if (!store) return null;
  const readiness = await activationService.getActivationReadiness(store.contractorId);
  return readiness.visible ? store : null;
}

/**
 * Shared pipeline tail: keep only LIVE stores whose contractor is APPROVED
 * (or legacy store.verified=true), matching nearby geo rules.
 */
function approvedLiveLookups(limit = 48) {
  return [
    { $limit: limit * 3 },
    {
      $lookup: {
        from: 'stores',
        localField: 'storeId',
        foreignField: '_id',
        as: 'storeDoc',
      },
    },
    { $unwind: '$storeDoc' },
    { $match: { 'storeDoc.status': STORE_STATUS.LIVE } },
    {
      $lookup: {
        from: 'contractorprofiles',
        localField: 'storeDoc.contractorId',
        foreignField: 'userId',
        as: 'profile',
      },
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        $or: [
          { 'profile.verificationStatus': VERIFICATION_STATUS.APPROVED },
          { 'storeDoc.verified': true },
        ],
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'storeDoc.contractorId',
        foreignField: '_id',
        as: 'owner',
      },
    },
    { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
    { $match: { 'owner.status': { $nin: [USER_STATUS.BLOCKED, USER_STATUS.BANNED] } } },
    { $limit: limit },
  ];
}

function publicStoreView(store) {
  const view = store.toPublic();
  if (store.status !== STORE_STATUS.LIVE || !activationService.hasValidLocation(store)) {
    view.location = null;
    view.locationConfirmed = false;
  }
  return view;
}

function hiddenProfile(store, readiness) {
  return {
    visibility: readiness.activationStatus === 'PAUSED' ? 'PAUSED' : 'INACTIVE',
    store: {
      id: store._id,
      name: store.name,
      city: store.city,
      storeType: store.storeType,
    },
    publicProfile: null,
    categories: [],
    reviews: null,
    highlights: null,
    contractor: null,
    services: [],
    materials: [],
  };
}

async function getPublicStore(id) {
  const store = await Store.findById(id);
  if (!store) throw new ApiError(404, 'Store not found');

  const profile = await ContractorProfile.findOne({ userId: store.contractorId });
  const approved =
    profile?.verificationStatus === VERIFICATION_STATUS.APPROVED || Boolean(store.verified);
  if (!approved) throw new ApiError(404, 'Store not found');
  const readiness = await activationService.getActivationReadiness(store.contractorId);
  if (!readiness.visible) return hiddenProfile(store, readiness);

  const published = profile
    ? store.storeType === 'MATERIALS'
      ? await seedMaterialPublicProfile(store, profile)
      : await seedPublicProfile(store, profile)
    : store;
  const [services, materials, reviews, reputation] = await Promise.all([
    Service.find({ storeId: published._id, ...publicPricedServiceMatch() }).sort({ category: 1 }),
    Material.find({ storeId: published._id }).sort({ category: 1 }),
    published.storeType === 'MATERIALS'
      ? reviewService.listForUser(published.contractorId, 'MATERIAL_STORE')
      : Promise.resolve(null),
    published.storeType === 'MATERIALS'
      ? reputationService.forMaterialStore(published.contractorId)
      : Promise.resolve(null),
  ]);
  const categories = published.storeType === 'MATERIALS' && profile
    ? await require('./material-category.service').categoriesForProfile(profile)
    : [];

  return {
    visibility: 'LIVE',
    store: publicStoreView(published),
    publicProfile: presentPublicProfile(published),
    categories,
    reviews: reviews
      ? {
          average: reviews.average,
          count: reviews.count,
          distribution: reviews.distribution,
          items: reviews.items.slice(0, 8).map((row) => ({
            id: row.id,
            rating: row.rating,
            comment: row.comment || '',
            createdAt: row.createdAt,
            customerName: row.customerName || '',
            contractorReply: row.contractorReply || '',
          })),
        }
      : null,
    reputation,
    services: services.map((s) => s.toPublic()),
    materials: materials.map((m) => m.toPublic()),
  };
}

async function getPublicContractor(id) {
  const profile = await ContractorProfile.findOne({
    $or: [{ userId: id }, { _id: id }],
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  });
  if (!profile) throw new ApiError(404, 'Contractor not found');

  const readiness = await activationService.getActivationReadiness(profile.userId);
  const found = readiness.visible
    ? await Store.findOne({
        contractorId: profile.userId,
        status: STORE_STATUS.LIVE,
        storeType: { $ne: 'MATERIALS' },
      })
    : null;
  if (!readiness.visible) {
    const named = await Store.findOne({ contractorId: profile.userId, storeType: { $ne: 'MATERIALS' } });
    return hiddenProfile(named || { _id: profile.userId, name: profile.businessName, city: profile.city, storeType: 'SERVICES' }, readiness);
  }
  const store = found ? await seedPublicProfile(found, profile) : null;
  const services = store
    ? await Service.find({ storeId: store._id, ...publicPricedServiceMatch() })
    : [];
  const publicProfile = store ? presentPublicProfile(store) : null;
  const reviewSummary = await reviewService.listForUser(profile.userId, 'CONTRACTOR');
  if (publicProfile) {
    publicProfile.address = '';
    publicProfile.rating = reviewSummary.average;
    publicProfile.reviewCount = reviewSummary.count;
  }
  const [highlights, reputation] = await Promise.all([
    loadPublicHighlights(profile.userId),
    reputationService.forContractor(profile.userId),
  ]);

  return {
    visibility: 'LIVE',
    publicProfile,
    highlights,
    reputation,
    contractor: publicProfile
      ? {
          id: profile.userId,
          userId: profile.userId,
          name: publicProfile.displayName,
          businessName: publicProfile.displayName,
          phone: publicProfile.phone,
          avatar: publicProfile.avatar,
          city: publicProfile.city,
          description: publicProfile.description,
          yearsExperience: publicProfile.yearsExperience,
        }
      : null,
    store: store ? publicStoreView(store) : null,
    services: services.map((s) => s.toPublic()),
  };
}

async function searchMaterials({ category, keyword, store }) {
  // isActive is publication, not "currently for sale". Paused and discontinued stay listed.
  const match = { isActive: true };
  if (store) {
    const live = await assertApprovedLiveStore(store);
    if (!live) return [];
    match.storeId = live._id;
  }
  if (category) match.category = category;
  if (keyword) {
    match.name = { $regex: escapeRegex(keyword), $options: 'i' };
  }

  const rows = (await Material.aggregate([{ $match: match }, ...approvedLiveLookups(48)])).filter((row) =>
    activationService.rowIsPublic(row, 'STORE')
  );
  return rows.map((row) => ({
    id: row._id,
    storeId: row.storeId,
    contractorId: row.contractorId,
    name: row.name,
    category: row.category,
    sku: row.sku || '',
    unit: row.unit,
    price: row.price,
    stock: row.stock,
    minOrderQty: row.minOrderQty,
    image: row.image || '',
    images: row.images?.length ? row.images : row.image ? [row.image] : [],
    description: row.description || '',
    isActive: row.isActive,
    listingStatus: row.listingStatus || (row.isActive === false ? 'PAUSED' : 'ACTIVE'),
    saleAvailability: row.saleAvailability || 'AVAILABLE',
    restockExpectedOn: row.restockExpectedOn || null,
    statusNote: row.statusNote || '',
    saleState: row.saleState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    store: row.storeDoc
      ? {
          id: row.storeDoc._id,
          name: row.storeDoc.name,
          address: row.storeDoc.address,
          city: row.storeDoc.city,
          coverImage: row.storeDoc.coverImage,
        }
      : null,
  }));
}

async function searchServices({ category, keyword, store }) {
  const match = { ...publicPricedServiceMatch() };
  if (store) {
    const live = await assertApprovedLiveStore(store);
    if (!live) return [];
    match.storeId = live._id;
  }
  if (category) match.category = category;
  if (keyword) {
    const folded = foldServiceName(keyword);
    const catalogHits = await CatalogService.find({
      status: { $in: LIVE_CATALOG_STATUSES },
      $or: [
        { name: { $regex: escapeRegex(keyword), $options: 'i' } },
        ...(folded ? [{ foldedName: { $regex: escapeRegex(folded), $options: 'i' } }] : []),
      ],
    }).select('code name');
    const names = [keyword];
    const keys = [];
    for (const hit of catalogHits) {
      names.push(hit.name);
      if (hit.code) {
        keys.push(hit.code);
        const labelKey = hit.code.split('::').pop();
        if (labelKey) names.push(labelKey);
      }
    }
    match.$or = [
      { name: { $regex: escapeRegex(keyword), $options: 'i' } },
      { category: { $regex: escapeRegex(keyword), $options: 'i' } },
      ...(names.length ? [{ name: { $in: names } }] : []),
      ...(keys.length ? [{ catalogKey: { $in: keys } }] : []),
    ];
  }

  const rows = (await Service.aggregate([{ $match: match }, ...approvedLiveLookups(48)])).filter((row) =>
    activationService.rowIsPublic(row, 'CONTRACTOR')
  );
  return rows.map((row) => ({
    id: row._id,
    storeId: row.storeId,
    contractorId: row.contractorId,
    name: row.name,
    category: row.category,
    description: row.description || '',
    basePrice: row.basePrice,
    unit: row.unit,
    estimatedHours: row.estimatedHours,
    image: row.image || '',
    images: row.images?.length ? row.images : row.image ? [row.image] : [],
    priceRange:
      row.priceRange?.max > 0 ? row.priceRange : { min: row.basePrice, max: row.basePrice },
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    store: row.storeDoc
      ? {
          id: row.storeDoc._id,
          name: row.storeDoc.name,
          address: row.storeDoc.address,
          city: row.storeDoc.city,
          coverImage: row.storeDoc.coverImage,
        }
      : null,
  }));
}

module.exports = {
  getPublicStore,
  getPublicContractor,
  searchMaterials,
  searchServices,
  assertApprovedLiveStore,
};
