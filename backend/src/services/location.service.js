const { Store, STORE_STATUS } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { seedPublicProfile } = require('./public-profile.service');

function km(meters) {
  return Math.round((meters / 1000) * 10) / 10;
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
    verified: profile.verificationStatus === VERIFICATION_STATUS.APPROVED,
    rating: review && review.count ? Math.round(Number(review.avg) * 10) / 10 : 0,
    reviewCount: review && review.count ? review.count : 0,
    completedProjects: completed?.count || 0,
    distance: km(doc.distanceMeters),
    location: doc.location,
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

async function geoNearby({ lat, lng, radiusKm, storeTypes, catalog }) {
  const query = { status: STORE_STATUS.LIVE };
  if (storeTypes?.length) query.storeType = { $in: storeTypes };
  const shelf = catalogLookup(catalog);

  const rows = await Store.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        distanceField: 'distanceMeters',
        maxDistance: Number(radiusKm) * 1000,
        spherical: true,
        query,
        key: 'location',
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
        from: 'reviews',
        let: { uid: '$contractorId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$targetUserId', '$$uid'] },
                  { $eq: ['$targetType', 'CONTRACTOR'] },
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
  return cards;
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

module.exports = { nearbyStores, nearbyContractors, applyMarketplaceFilters };
