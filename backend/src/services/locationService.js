const { STORE_STATUS } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { env } = require('../config/env');
const { categoriesFromLegacyAreas } = require('../constants/material-categories');
const { seedPublicProfile } = require('./publicProfileService');
const { cardIsPublic } = require('./activation.service');

function listedMaterialCategories(profile) {
  const stored = Array.isArray(profile?.materialCategories) ? profile.materialCategories : [];
  const source = stored.length ? stored : categoriesFromLegacyAreas(profile?.serviceAreas);
  return source
    .filter((item) => item && item.name)
    .map((item) => ({
      name: item.name,
      type: item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
    }));
}

function presentDistance(meters) {
  const distanceMeters = Math.max(0, Math.round(Number(meters) || 0));
  return {
    distanceMeters,
    distance: Math.round((distanceMeters / 1000) * 100) / 100,
  };
}

function geoNearStage(lat, lng, radiusKm) {
  return {
    near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
    distanceField: 'distanceMeters',
    maxDistance: Number(radiusKm) * 1000,
    spherical: true,
    key: 'location',
  };
}

function toCard(doc, catalog) {
  const profile = doc.profile || {};
  const review = Array.isArray(doc.reviewStats) ? doc.reviewStats[0] : null;
  const completed = Array.isArray(doc.completedStats) ? doc.completedStats[0] : null;
  const services =
    catalog === 'services'
      ? (doc.services || []).map((s) => ({
          id: s._id,
          name: s.name,
          category: s.category,
          basePrice: s.basePrice,
        }))
      : [];
  const products =
    catalog === 'materials'
      ? (doc.products || []).map((item) => ({
          id: item._id,
          name: item.name,
          category: item.category,
          price: item.price,
          unit: item.unit,
        }))
      : [];

  return {
    id: doc._id,
    contractorId: doc.contractorId,
    storeName: doc.name,
    businessName: doc.name || '',
    slogan: doc.slogan || '',
    description: doc.description || '',
    address: doc.address || '',
    city: doc.city || '',
    phone: doc.phone || '',
    storeType: doc.storeType,
    category: doc.category,
    avatar: doc.avatar || '',
    logo: doc.logo || '',
    coverImage: doc.coverImage || '',
    openingHours: doc.openingHours,
    hasGallery: Array.isArray(doc.gallery) && doc.gallery.length > 0,
    accountStatus: doc.owner?.status || '',
    verified: profile.verificationStatus === VERIFICATION_STATUS.APPROVED,
    rating: review && review.count ? Math.round(Number(review.avg) * 10) / 10 : 0,
    reviewCount: review && review.count ? review.count : 0,
    reputationScore: doc.reputation?.published && doc.reputation.score != null ? doc.reputation.score : null,
    reputationGrade: doc.reputation?.published ? doc.reputation.grade : null,
    completedProjects: completed?.count || 0,
    materialCategories: catalog === 'materials' ? listedMaterialCategories(profile) : [],
    ...presentDistance(doc.distanceMeters),
    serviceRadiusKm: doc.serviceRadiusKm || 0,
    deliveryEnabled: Boolean(doc.deliveryEnabled),
    baseDeliveryFee: doc.baseDeliveryFee || 0,
    location: doc.location,
    locationConfirmed: doc.locationConfirmed === true,
    services,
    products,
  };
}

function catalogLookup(catalog) {
  if (catalog === 'materials') {
    return {
      from: 'materials',
      as: 'products',
      project: { name: 1, category: 1, price: 1, unit: 1 },
    };
  }
  return {
    from: 'services',
    as: 'services',
    project: { name: 1, category: 1, basePrice: 1 },
  };
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function geoNearbyPostgres({ lat, lng, radiusKm, storeTypes, catalog }) {
  const { prisma } = require('../config/prisma');
  const stores = await prisma.stores.findMany({
    where: {
      status: STORE_STATUS.LIVE,
      verified: true,
      ...(storeTypes?.length ? { store_type: { in: storeTypes } } : {}),
    },
    include: {
      locations: true,
      users: { select: { id: true, legacy_mongo_id: true, account_status: true } },
      store_media: true,
      store_service_areas: true,
    },
  });
  const maxMeters = Number(radiusKm) * 1000;
  const near = stores
    .map((store) => {
      const latitude = store.locations?.latitude;
      const longitude = store.locations?.longitude;
      if (latitude == null || longitude == null) return null;
      if (['BLOCKED', 'BANNED'].includes(store.users?.account_status)) return null;
      const meters = distanceMeters(lat, lng, latitude, longitude);
      return meters <= maxMeters ? { store, meters } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.meters - b.meters);
  const ownerIds = near.map((item) => item.store.owner_user_id);
  const profiles = ownerIds.length
    ? await prisma.contractor_profiles.findMany({
      where: { user_id: { in: ownerIds }, verification_status: VERIFICATION_STATUS.APPROVED },
      include: {
        contractor_service_areas: true,
        contractor_material_categories: { include: { material_categories: true } },
      },
    })
    : [];
  const profileByUser = new Map(profiles.map((profile) => [String(profile.user_id), profile]));
  const kept = near.filter((item) => profileByUser.has(String(item.store.owner_user_id)));
  const storeIds = kept.map((item) => item.store.id);
  const shelf = !storeIds.length
    ? []
    : catalog === 'materials'
    ? await prisma.materials.findMany({
      where: { store_id: { in: storeIds }, is_active: true }, // published shelf, including paused and discontinued
      include: { material_categories: true },
      orderBy: { id: 'asc' },
    })
    : await prisma.services.findMany({
      where: {
        store_id: { in: storeIds },
        is_active: true,
        base_price: { gt: 0 },
        completion_status: { not: 'INCOMPLETE' },
      },
      include: { service_categories: true },
      orderBy: { id: 'asc' },
    });
  const byStore = new Map();
  for (const item of shelf) {
    const list = byStore.get(String(item.store_id)) || [];
    if (list.length < 8) list.push(item);
    byStore.set(String(item.store_id), list);
  }
  const targetType = catalog === 'materials' ? 'MATERIAL_STORE' : 'CONTRACTOR';
  const reviewRows = ownerIds.length
    ? await prisma.reviews.groupBy({
      by: ['target_user_id'],
      where: { target_user_id: { in: ownerIds }, target_type: targetType },
      _avg: { rating: true },
      _count: { _all: true },
    })
    : [];
  const orderRows = ownerIds.length
    ? await prisma.service_orders.groupBy({
      by: ['contractor_user_id'],
      where: {
        contractor_user_id: { in: ownerIds },
        status: { in: ['COMPLETED', 'CUSTOMER_ACCEPTED'] },
      },
      _count: { _all: true },
    })
    : [];
  const reviewByUser = new Map(reviewRows.map((row) => [String(row.target_user_id), row]));
  const ordersByUser = new Map(orderRows.map((row) => [String(row.contractor_user_id), row._count._all]));
  const reputationService = require('./reputationService');
  const ownerKeys = kept.map((item) => item.store.owner_user_id);
  const reputationByOwner = catalog === 'materials'
    ? await reputationService.scoresForMaterialOwners(ownerKeys)
    : await reputationService.scoresForContractorOwners(ownerKeys);

  const cards = [];
  for (const item of kept) {
    const store = item.store;
    const profileRow = profileByUser.get(String(store.owner_user_id));
    const gallery = (store.store_media || []).filter((media) => media.media_type === 'GALLERY');
    const shelfRows = byStore.get(String(store.id)) || [];
    const review = reviewByUser.get(String(store.owner_user_id));
    const doc = {
      _id: store.legacy_mongo_id,
      contractorId: store.users?.legacy_mongo_id || '',
      name: store.name,
      slogan: store.slogan || '',
      description: store.description || '',
      address: store.locations?.formatted_address || '',
      city: store.locations?.city || '',
      phone: store.phone || '',
      storeType: store.store_type,
      category: store.category,
      avatar: store.avatar_url || '',
      logo: store.logo_url || '',
      coverImage: store.cover_image_url || '',
      openingHours: store.opening_hours,
      gallery: gallery.map((media) => media.file_url),
      owner: { status: store.users?.account_status || '' },
      profile: {
        verificationStatus: profileRow.verification_status,
        serviceAreas: (profileRow.contractor_service_areas || []).map((area) => area.area_name),
        materialCategories: (profileRow.contractor_material_categories || []).map((entry) => ({
          name: entry.material_categories?.name || '',
          type: entry.material_categories?.category_type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
        })),
      },
      reviewStats: review ? [{ count: review._count._all, avg: Number(review._avg.rating || 0) }] : [],
      reputation: reputationByOwner.get(String(store.owner_user_id)) || null,
      completedStats: [{ count: ordersByUser.get(String(store.owner_user_id)) || 0 }],
      services: catalog === 'services'
        ? shelfRows.map((row) => ({
          _id: row.legacy_mongo_id,
          name: row.name,
          category: row.service_categories?.name || '',
          basePrice: Number(row.base_price || 0),
        }))
        : [],
      products: catalog === 'materials'
        ? shelfRows.map((row) => ({
          _id: row.legacy_mongo_id,
          name: row.name,
          category: row.material_categories?.name || '',
          price: Number(row.price || 0),
          unit: row.unit,
        }))
        : [],
      publicSeeded: store.public_seeded,
      distanceMeters: item.meters,
      serviceRadiusKm: Number(store.service_radius_km || 0),
      deliveryEnabled: store.delivery_enabled,
      baseDeliveryFee: Number(store.base_delivery_fee || 0),
      location: {
        type: 'Point',
        coordinates: [Number(store.locations.longitude), Number(store.locations.latitude)],
      },
      locationConfirmed: store.locations?.is_confirmed === true,
    };
    if (catalog === 'services' && doc.profile && !doc.publicSeeded && doc.storeType !== 'MATERIALS') {
      try {
        const seeded = await seedPublicProfile(doc._id, doc.profile);
        if (seeded) {
          doc.name = seeded.name;
          doc.slogan = seeded.slogan;
          doc.description = seeded.description;
          doc.phone = seeded.phone;
          doc.coverImage = seeded.coverImage;
          doc.avatar = seeded.avatar;
          doc.logo = seeded.logo;
          doc.publicSeeded = true;
        }
      } catch {
        // A missing public copy must not hide the crew from the map.
      }
    }
    cards.push(toCard(doc, catalog));
  }
  return cards.filter((card) => cardIsPublic(card, catalog));
}

async function geoNearby({ lat, lng, radiusKm, storeTypes, catalog }) {
  if (env.databaseProvider === 'postgres') {
    return geoNearbyPostgres({ lat, lng, radiusKm, storeTypes, catalog });
  }
  const { Store } = require('../models/Store');
  const query = { status: STORE_STATUS.LIVE, verified: true };
  if (storeTypes?.length) query.storeType = { $in: storeTypes };
  const shelf = catalogLookup(catalog);

  const rows = await Store.aggregate([
    {
      $geoNear: {
        ...geoNearStage(lat, lng, radiusKm),
        query,
      },
    },
    {
      $lookup: {
        from: shelf.from,
        let: { sid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$storeId', '$$sid'] },
                  { $eq: ['$isActive', true] },
                  ...(catalog === 'services'
                    ? [{ $gt: ['$basePrice', 0] }, { $ne: ['$completionStatus', 'INCOMPLETE'] }]
                    : []),
                ],
              },
            },
          },
          { $project: shelf.project },
          { $limit: 8 },
        ],
        as: shelf.as,
      },
    },
    {
      $lookup: {
        from: 'contractorprofiles',
        localField: 'contractorId',
        foreignField: 'userId',
        as: 'profile',
      },
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $match: {
        'profile.verificationStatus': VERIFICATION_STATUS.APPROVED,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'contractorId',
        foreignField: '_id',
        as: 'owner',
      },
    },
    { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
    { $match: { 'owner.status': { $nin: ['BLOCKED', 'BANNED'] } } },
    {
      $lookup: {
        from: 'reviews',
        let: { uid: '$contractorId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$targetUserId', '$$uid'] },
                  { $eq: ['$targetType', catalog === 'materials' ? 'MATERIAL_STORE' : 'CONTRACTOR'] },
                ],
              },
            },
          },
          { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
        ],
        as: 'reviewStats',
      },
    },
    {
      $lookup: {
        from: 'orders',
        let: { uid: '$contractorId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$contractorId', '$$uid'] },
                  { $in: ['$status', ['COMPLETED', 'CUSTOMER_ACCEPTED']] },
                ],
              },
            },
          },
          { $count: 'count' },
        ],
        as: 'completedStats',
      },
    },
  ]);

  const cards = [];
  for (const doc of rows) {
    if (catalog === 'services' && doc.profile && !doc.publicSeeded && doc.storeType !== 'MATERIALS') {
      try {
        const seeded = await seedPublicProfile(doc._id, doc.profile);
        if (seeded) {
          doc.name = seeded.name;
          doc.slogan = seeded.slogan;
          doc.description = seeded.description;
          doc.phone = seeded.phone;
          doc.coverImage = seeded.coverImage;
          doc.avatar = seeded.avatar;
          doc.logo = seeded.logo;
          doc.publicSeeded = true;
        }
      } catch {
        // A missing public copy must not hide the crew from the map.
      }
    }
    cards.push(toCard(doc, catalog));
  }
  return cards.filter((card) => cardIsPublic(card, catalog));
}

function applyMarketplaceFilters(rows, { category, minRating, storeType } = {}) {
  return rows.filter((row) => {
    if (storeType && row.storeType !== storeType && !(storeType === 'BOTH' || row.storeType === 'BOTH')) {
      return false;
    }
    if (minRating && Number(row.rating || 0) < Number(minRating)) {
      return false;
    }
    if (category) {
      const cat = String(category).toLowerCase();
      const hit =
        String(row.category || '').toLowerCase().includes(cat) ||
        (row.services || []).some(
          (s) =>
            String(s.category || '').toLowerCase().includes(cat) ||
            String(s.name || '').toLowerCase().includes(cat)
        ) ||
        (row.products || []).some(
          (item) =>
            String(item.category || '').toLowerCase().includes(cat) ||
            String(item.name || '').toLowerCase().includes(cat)
        );
      if (!hit) return false;
    }
    return true;
  });
}

async function nearbyStores(params) {
  const rows = await geoNearby({
    ...params,
    catalog: 'materials',
    storeTypes: params.storeType ? [params.storeType, 'BOTH'] : ['MATERIALS', 'BOTH'],
  });
  return applyMarketplaceFilters(rows, params);
}

async function nearbyContractors(params) {
  const rows = await geoNearby({
    ...params,
    catalog: 'services',
    storeTypes: params.storeType ? [params.storeType, 'BOTH'] : ['SERVICES', 'BOTH'],
  });
  return applyMarketplaceFilters(rows, params);
}

module.exports = { nearbyStores, nearbyContractors, applyMarketplaceFilters, presentDistance, geoNearStage };
