const { Store, STORE_STATUS } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');

function km(meters) {
  return Math.round((meters / 1000) * 10) / 10;
}

function toCard(doc, catalog) {
  const profile = doc.profile || {};
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
    businessName: profile.businessName || doc.name,
    slogan: doc.slogan,
    address: doc.address,
    city: doc.city,
    phone: doc.phone,
    storeType: doc.storeType,
    category: doc.category,
    coverImage: doc.coverImage,
    openingHours: doc.openingHours,
    verified: Boolean(doc.verified || profile.verificationStatus === VERIFICATION_STATUS.APPROVED),
    rating: doc.rating || 0,
    reviewCount: doc.reviewCount || 0,
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
                $and: [{ $eq: ['$storeId', '$$sid'] }, { $eq: ['$isActive', true] }],
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
        $or: [
          { 'profile.verificationStatus': VERIFICATION_STATUS.APPROVED },
          { verified: true },
        ],
      },
    },
  ]);

  return rows.map((doc) => toCard(doc, catalog));
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
