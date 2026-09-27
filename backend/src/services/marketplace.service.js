const { Store, STORE_STATUS } = require('../models/Store');
const { Service } = require('../models/Service');
const { Material } = require('../models/Material');
const { ContractorProfile, VERIFICATION_STATUS, DOCUMENT_TYPE } = require('../models/ContractorProfile');
const { User } = require('../models/User');
const { ApiError } = require('../utils/ApiError');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertApprovedLiveStore(storeId) {
  const store = await Store.findOne({ _id: storeId, status: STORE_STATUS.LIVE });
  if (!store) return null;
  const profile = await ContractorProfile.findOne({ userId: store.contractorId });
  const approved =
    profile?.verificationStatus === VERIFICATION_STATUS.APPROVED || Boolean(store.verified);
  return approved ? store : null;
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
    { $limit: limit },
  ];
}

async function getPublicStore(id) {
  const store = await Store.findOne({ _id: id, status: STORE_STATUS.LIVE });
  if (!store) throw new ApiError(404, 'Store not found');

  const profile = await ContractorProfile.findOne({ userId: store.contractorId });
  const approved =
    profile?.verificationStatus === VERIFICATION_STATUS.APPROVED || Boolean(store.verified);
  if (!approved) throw new ApiError(404, 'Store not found');

  const [services, materials] = await Promise.all([
    Service.find({ storeId: store._id, isActive: true }).sort({ category: 1 }),
    Material.find({ storeId: store._id, isActive: true }).sort({ category: 1 }),
  ]);

  return {
    store: store.toPublic(),
    profile: profile ? profile.toPublic() : null,
    services: services.map((s) => s.toPublic()),
    materials: materials.map((m) => m.toPublic()),
  };
}

async function getPublicContractor(id) {
  const user = await User.findById(id);
  const profile = await ContractorProfile.findOne({
    $or: [{ userId: id }, { _id: id }],
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  });
  if (!profile) throw new ApiError(404, 'Contractor not found');

  const store = await Store.findOne({
    contractorId: profile.userId,
    status: STORE_STATUS.LIVE,
  });
  const services = store
    ? await Service.find({ storeId: store._id, isActive: true })
    : [];
  const owner = user || (await User.findById(profile.userId));

  const documents = profile.documents || [];
  return {
    contractor: {
      ...profile.toPublic(),
      id: profile.userId,
      name: owner?.name || profile.businessName,
      avatar: owner?.avatar || '',
      phone: owner?.phone || store?.phone || '',
      certificates: documents.filter((d) => d.type === DOCUMENT_TYPE.CERTIFICATE),
      portfolio: documents.filter((d) => d.type === DOCUMENT_TYPE.PORTFOLIO),
      license: documents.filter((d) => d.type === DOCUMENT_TYPE.BUSINESS_LICENSE),
    },
    store: store ? store.toPublic() : null,
    services: services.map((s) => s.toPublic()),
  };
}

async function searchMaterials({ category, keyword, store }) {
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

  const rows = await Material.aggregate([{ $match: match }, ...approvedLiveLookups(48)]);
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
  const match = { isActive: true };
  if (store) {
    const live = await assertApprovedLiveStore(store);
    if (!live) return [];
    match.storeId = live._id;
  }
  if (category) match.category = category;
  if (keyword) {
    match.$or = [
      { name: { $regex: escapeRegex(keyword), $options: 'i' } },
      { category: { $regex: escapeRegex(keyword), $options: 'i' } },
    ];
  }

  const rows = await Service.aggregate([{ $match: match }, ...approvedLiveLookups(48)]);
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
