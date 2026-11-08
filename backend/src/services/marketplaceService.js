const { STORE_STATUS } = require('../models/Store');
const { Service, Material, CatalogService, MaterialCategory } = require('../repositories/offeringAccess');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ContractorProfile, Store } = require('../repositories/partnerAccess');
const { ApiError } = require('../utils/ApiError');
const { publicPricedServiceMatch, foldServiceName } = require('../constants/contractorServices');
const { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_LABELS, categoryAliases } = require('../constants/material-categories');
const { saleStateOf } = require('../utils/material-sale');
const { presentPublicProfile, seedPublicProfile, seedMaterialPublicProfile, loadPublicHighlights } = require('./publicProfileService');
const reviewService = require('./reviewService');
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

function publicStoreView(store, weeklyHours) {
  const view = store.toPublic();
  if (weeklyHours !== undefined) {
    const { normalizeWeeklyHours, toOperatingHours, hoursStatus } = require('../utils/weeklyHours');
    const hours = normalizeWeeklyHours(weeklyHours);
    view.weeklyHours = hours;
    view.operatingHours = toOperatingHours(hours);
    view.hoursStatus = hoursStatus(hours);
  }
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
  const [services, materials, reviews] = await Promise.all([
    Service.find({ storeId: published._id, ...publicPricedServiceMatch() }).sort({ category: 1 }),
    Material.find({ storeId: published._id }).sort({ category: 1 }),
    published.storeType === 'MATERIALS'
      ? reviewService.listForUser(published.contractorId, 'MATERIAL_STORE')
      : Promise.resolve(null),
  ]);
  const categories = published.storeType === 'MATERIALS' && profile
    ? await require('./material-category.service').categoriesForProfile(profile)
    : [];

  return {
    visibility: 'LIVE',
    store: publicStoreView(published, profile?.weeklyHours),
    publicProfile: presentPublicProfile(published, profile?.weeklyHours),
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
    services: services.map((s) => s.toPublic()),
    materials: materials.map((m) => {
      const pub = m.toPublic();
      // Ensure discontinued product price is not leaked in public store view
      if (pub.saleState === 'discontinued') {
        pub.price = null;
      }
      return pub;
    }),
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
  const publicProfile = store ? presentPublicProfile(store, profile.weeklyHours) : null;
  const reviewSummary = await reviewService.listForUser(profile.userId, 'CONTRACTOR');
  if (publicProfile) {
    publicProfile.address = '';
    publicProfile.rating = reviewSummary.average;
    publicProfile.reviewCount = reviewSummary.count;
  }
  const highlights = await loadPublicHighlights(profile.userId);

  return {
    visibility: 'LIVE',
    publicProfile,
    highlights,
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
    store: store ? publicStoreView(store, profile.weeklyHours) : null,
    services: services.map((s) => s.toPublic()),
  };
}

async function getPublicMaterialCategories() {
  const custom = await MaterialCategory.find({
    status: 'APPROVED',
  });
  const categoriesMap = new Map();
  for (const name of MATERIAL_CATEGORIES) {
    const key = foldServiceName(name);
    categoriesMap.set(key, {
      id: null,
      name,
      type: 'SYSTEM',
      labelVi: MATERIAL_CATEGORY_LABELS.vi[name] || name,
      labelEn: MATERIAL_CATEGORY_LABELS.en[name] || name,
    });
  }
  for (const doc of custom) {
    const key = foldServiceName(doc.name);
    const existing = categoriesMap.get(key);
    if (existing) {
      existing.id = String(doc._id || doc.id);
    } else {
      categoriesMap.set(key, {
        id: String(doc._id || doc.id),
        name: doc.name,
        type: doc.type || 'CUSTOM',
        labelVi: doc.name,
        labelEn: doc.name,
      });
    }
  }
  return Array.from(categoriesMap.values());
}

async function searchMaterials({
  category,
  categoryId,
  keyword,
  store,
  minPrice,
  maxPrice,
  sellingStatus,
  sortBy = 'default',
  page,
  limit,
}) {
  // isActive is publication, not "currently for sale". Paused and discontinued stay listed.
  const match = { isActive: true };
  if (store) {
    const live = await assertApprovedLiveStore(store);
    if (!live) {
      if (page != null || limit != null) {
        return {
          items: [],
          total: 0,
          page: Math.max(1, Number(page) || 1),
          limit: Math.max(1, Number(limit) || 12),
          totalPages: 1,
        };
      }
      return [];
    }
    match.storeId = live._id;
  }

  const isPaginated = page != null || limit != null;
  const lookupLimit = isPaginated ? 500 : 48;
  let rows = (await Material.aggregate([{ $match: match }, ...approvedLiveLookups(lookupLimit)])).filter((row) =>
    activationService.rowIsPublic(row, 'STORE')
  );

  // 1. Keyword search (case-insensitive, partial matching, accented and unaccented Vietnamese)
  if (keyword) {
    const kw = keyword.trim().toLowerCase();
    const foldedKw = foldServiceName(kw);
    rows = rows.filter((row) => {
      const name = String(row.name || '').toLowerCase();
      const foldedName = foldServiceName(name);
      const sku = String(row.sku || '').toLowerCase();
      const desc = String(row.description || '').toLowerCase();
      const foldedDesc = foldServiceName(desc);
      return (
        name.includes(kw) ||
        foldedName.includes(foldedKw) ||
        sku.includes(kw) ||
        desc.includes(kw) ||
        foldedDesc.includes(foldedKw)
      );
    });
  }

  // 2. Category / CategoryId filter
  if (categoryId) {
    const targetCatId = String(categoryId).trim();
    rows = rows.filter((row) => {
      const rowCatId = String(row.categoryId || row.materialCategoryId || row.material_category_id || '');
      return rowCatId === targetCatId;
    });
  } else if (category && category !== 'ALL' && category !== 'Tất cả') {
    const cat = String(category).trim();
    const foldedCat = foldServiceName(cat);
    rows = rows.filter((row) => {
      const rowCat = String(row.category || '');
      if (rowCat.toLowerCase() === cat.toLowerCase()) return true;
      if (foldServiceName(rowCat) === foldedCat) return true;
      const aliases = categoryAliases(rowCat);
      return aliases.some((alias) => foldServiceName(alias) === foldedCat);
    });
  }

  // 3. Selling status computation & filter
  rows = rows.map((row) => ({
    ...row,
    saleState: saleStateOf(row),
  }));

  if (sellingStatus && sellingStatus !== 'all') {
    rows = rows.filter((row) => row.saleState === sellingStatus);
  }

  // 4. Price range filter
  // Discontinued products have public price hidden; excluded from numerical price filtering
  const min = minPrice != null && !Number.isNaN(Number(minPrice)) ? Number(minPrice) : null;
  const max = maxPrice != null && !Number.isNaN(Number(maxPrice)) ? Number(maxPrice) : null;
  if (min != null || max != null) {
    rows = rows.filter((row) => {
      if (row.saleState === 'discontinued') return false;
      const price = Number(row.price) || 0;
      if (min != null && price < min) return false;
      if (max != null && price > max) return false;
      return true;
    });
  }

  // 5. Sorting (stable order with tie-breakers)
  rows.sort((a, b) => {
    if (sortBy === 'price_asc') {
      const aDisc = a.saleState === 'discontinued';
      const bDisc = b.saleState === 'discontinued';
      if (aDisc && !bDisc) return 1;
      if (!aDisc && bDisc) return -1;
      if (aDisc && bDisc) return String(a._id).localeCompare(String(b._id));
      const diff = Number(a.price) - Number(b.price);
      if (diff !== 0) return diff;
      return String(a._id).localeCompare(String(b._id));
    }
    if (sortBy === 'price_desc') {
      const aDisc = a.saleState === 'discontinued';
      const bDisc = b.saleState === 'discontinued';
      if (aDisc && !bDisc) return 1;
      if (!aDisc && bDisc) return -1;
      if (aDisc && bDisc) return String(a._id).localeCompare(String(b._id));
      const diff = Number(b.price) - Number(a.price);
      if (diff !== 0) return diff;
      return String(a._id).localeCompare(String(b._id));
    }
    if (sortBy === 'newest') {
      const diff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (diff !== 0) return diff;
      return String(a._id).localeCompare(String(b._id));
    }
    // Default sorting: stable by createdAt desc then _id
    const diff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    if (diff !== 0) return diff;
    return String(a._id).localeCompare(String(b._id));
  });

  const total = rows.length;

  // 6. Pagination
  let resultRows = rows;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 12));

  if (isPaginated) {
    const offset = (pageNum - 1) * limitNum;
    resultRows = rows.slice(offset, offset + limitNum);
  } else {
    resultRows = rows.slice(0, 48);
  }

  const mapped = resultRows.map((row) => {
    const isDiscontinued = row.saleState === 'discontinued';
    return {
      id: row._id,
      storeId: row.storeId,
      contractorId: row.contractorId,
      name: row.name,
      category: row.category,
      categoryId: row.categoryId || null,
      sku: row.sku || '',
      unit: row.unit,
      price: isDiscontinued ? null : Number(row.price),
      stock: Number(row.stock),
      minOrderQty: Number(row.minOrderQty),
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
    };
  });

  if (isPaginated) {
    return {
      items: mapped,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  return mapped;
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
  getPublicMaterialCategories,
  searchMaterials,
  searchServices,
  assertApprovedLiveStore,
};
