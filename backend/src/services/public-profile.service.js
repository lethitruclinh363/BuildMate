const { Store, STORE_TYPE } = require('../models/Store');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Service } = require('../models/Service');
const { Order, ORDER_STATUS } = require('../models/Order');
const { RepairRequest } = require('../models/RepairRequest');
const { Quotation, QUOTATION_STATUS } = require('../models/Quotation');
const { ApiError } = require('../utils/ApiError');
const { publicPricedServiceMatch } = require('../constants/contractor-services');
const { assertDeliveryPolicy } = require('../utils/delivery-policy');
const { hasValidLocation } = require('./activation.service');

function presentPublicProfile(store) {
  return {
    id: store._id || store.id,
    contractorId: store.contractorId,
    displayName: store.name || '',
    slogan: store.slogan || '',
    description: store.description || '',
    phone: store.phone || '',
    contactName: store.contactName || '',
    contactEmail: store.contactEmail || '',
    address: store.address || '',
    city: store.city || '',
    avatar: store.avatar || '',
    logo: store.logo || '',
    coverImage: store.coverImage || '',
    gallery: store.gallery || [],
    crewPhotos: store.crewPhotos || [],
    publicCertificates: store.publicCertificates || [],
    achievements: store.achievements || '',
    showroomNote: store.showroomNote || '',
    deliveryNote: store.deliveryNote || '',
    deliveryEnabled: Boolean(store.deliveryEnabled),
    baseDeliveryFee: store.baseDeliveryFee || 0,
    freeDeliveryRadiusKm: store.freeDeliveryRadiusKm || 0,
    deliveryFeePerKm: store.deliveryFeePerKm || 0,
    minimumOrderAmount: store.minimumOrderAmount || 0,
    openingHours: store.openingHours || '',
    serviceAreas: store.serviceAreas || [],
    yearsExperience: store.displayYears ?? 0,
    workerCount: store.displayWorkerCount ?? 0,
    serviceRadiusKm: store.serviceRadiusKm || 0,
    areaCenter: hasValidLocation(store) ? areaCenter(store) : null,
    locationReady: hasValidLocation(store),
    verified: Boolean(store.verified),
    rating: store.rating || 0,
    reviewCount: store.reviewCount || 0,
  };
}

function areaCenter(store) {
  const coords = store.location?.coordinates || [];
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function loadPublicHighlights(contractorId) {
  const [orders, requests, quotes] = await Promise.all([
    Order.find({ contractorId }).select('status customerId'),
    RepairRequest.find({ contractorId }).select('createdAt status'),
    Quotation.find({ contractorId, status: { $ne: QUOTATION_STATUS.DRAFT } }).select('requestId createdAt'),
  ]);
  const completed = orders.filter(
    (order) => order.status === ORDER_STATUS.COMPLETED || order.status === ORDER_STATUS.CUSTOMER_ACCEPTED
  );
  const cancelled = orders.filter((order) => order.status === ORDER_STATUS.CANCELLED);
  const highlights = {};
  if (completed.length) {
    highlights.completedProjects = completed.length;
    highlights.customersServed = new Set(completed.map((order) => String(order.customerId))).size;
  }
  const finished = completed.length + cancelled.length;
  if (finished) highlights.completionRate = Math.round((completed.length / finished) * 100);

  const firstQuote = new Map();
  for (const quote of quotes) {
    const key = String(quote.requestId);
    const at = quote.createdAt ? new Date(quote.createdAt).getTime() : 0;
    const prev = firstQuote.get(key);
    if (!prev || at < prev) firstQuote.set(key, at);
  }
  let answered = 0;
  const delays = [];
  for (const request of requests) {
    const quotedAt = firstQuote.get(String(request._id));
    if (quotedAt || request.status === 'ACCEPTED' || request.status === 'REJECTED') answered += 1;
    if (quotedAt && request.createdAt) {
      const minutes = Math.round((quotedAt - new Date(request.createdAt).getTime()) / 60000);
      if (minutes >= 0) delays.push(minutes);
    }
  }
  if (requests.length) highlights.responseRate = Math.round((answered / requests.length) * 100);
  if (delays.length) {
    highlights.averageResponseMinutes = Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length);
  }
  return highlights;
}

function fillIfEmpty(store, key, value) {
  const current = store[key];
  const empty = current == null || current === '' || (Array.isArray(current) && current.length === 0);
  if (!empty) return;
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return;
  store[key] = value;
}

async function seedPublicProfile(storeOrId, profile) {
  const store = storeOrId?.save ? storeOrId : await Store.findById(storeOrId);
  if (!store || store.publicSeeded || !profile) return store;
  if (store.storeType === STORE_TYPE.MATERIALS) return store;
  const portfolio = profile.portfolio || {};
  fillIfEmpty(store, 'avatar', portfolio.avatar);
  fillIfEmpty(store, 'logo', portfolio.teamLogo);
  fillIfEmpty(store, 'coverImage', portfolio.workshop || portfolio.avatar);
  fillIfEmpty(store, 'gallery', portfolio.construction || []);
  fillIfEmpty(store, 'crewPhotos', [portfolio.avatar, portfolio.teamLogo].filter(Boolean));
  fillIfEmpty(store, 'publicCertificates', portfolio.certificates || []);
  fillIfEmpty(store, 'description', profile.description);
  fillIfEmpty(store, 'phone', profile.contactPhone);
  fillIfEmpty(store, 'serviceAreas', profile.serviceAreas || []);
  if (store.displayYears == null) store.displayYears = profile.yearsExperience || 0;
  if (store.displayWorkerCount == null) store.displayWorkerCount = profile.workerCount || 0;
  store.publicSeeded = true;
  await store.save();
  return store;
}

async function loadApprovedStore(userId) {
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(403, 'This partner is not verified yet');
  }
  const store = await Store.findOne({
    contractorId: userId,
    storeType: { $in: [STORE_TYPE.SERVICES, STORE_TYPE.BOTH] },
  });
  if (!store) throw new ApiError(404, 'Store not found');
  return { profile, store: await seedPublicProfile(store, profile) };
}

async function getPublicProfile(userId) {
  const { store } = await loadApprovedStore(userId);
  const services = await Service.find({ storeId: store._id, ...publicPricedServiceMatch() }).sort({ category: 1 });
  return {
    publicProfile: presentPublicProfile(store),
    services: services.map((item) => item.toPublic()),
  };
}

const PUBLIC_FIELDS = new Set([
  'displayName', 'slogan', 'description', 'phone', 'address', 'city',
  'coverImage', 'avatar', 'logo', 'openingHours', 'achievements',
  'gallery', 'crewPhotos', 'publicCertificates', 'serviceAreas',
  'yearsExperience', 'workerCount',
]);

async function updatePublicProfile(userId, body) {
  const extra = Object.keys(body).filter((key) => !PUBLIC_FIELDS.has(key));
  if (extra.length) {
    throw new ApiError(422, 'Verified details cannot be changed from the public profile');
  }
  const { store } = await loadApprovedStore(userId);
  const map = {
    displayName: 'name',
    slogan: 'slogan',
    description: 'description',
    phone: 'phone',
    address: 'address',
    city: 'city',
    coverImage: 'coverImage',
    avatar: 'avatar',
    logo: 'logo',
    openingHours: 'openingHours',
    achievements: 'achievements',
  };
  for (const [incoming, key] of Object.entries(map)) {
    if (body[incoming] !== undefined) store[key] = body[incoming];
  }
  for (const key of ['gallery', 'crewPhotos', 'publicCertificates', 'serviceAreas']) {
    if (Array.isArray(body[key])) store[key] = body[key].filter(Boolean).slice(0, 8);
  }
  if (body.yearsExperience !== undefined) store.displayYears = body.yearsExperience;
  if (body.workerCount !== undefined) store.displayWorkerCount = body.workerCount;
  store.publicSeeded = true;
  await store.save();
  return presentPublicProfile(store);
}

const STORE_PUBLIC_FIELDS = new Set([
  'displayName', 'slogan', 'description', 'phone', 'contactName', 'contactEmail', 'address', 'city',
  'coverImage', 'avatar', 'logo', 'openingHours', 'showroomNote', 'deliveryNote',
  'gallery', 'serviceAreas', 'serviceRadiusKm',
]);

function presentMaterialPublic(store) {
  return {
    ...presentPublicProfile(store),
    profileType: 'STORE',
    showroomNote: store.showroomNote || '',
    deliveryNote: store.deliveryNote || '',
  };
}

async function seedMaterialPublicProfile(storeOrId, profile) {
  const store = storeOrId?.save ? storeOrId : await Store.findById(storeOrId);
  if (!store || store.publicSeeded || !profile) return store;
  if (store.storeType !== STORE_TYPE.MATERIALS) return store;
  fillIfEmpty(store, 'description', profile.description);
  fillIfEmpty(store, 'phone', profile.contactPhone);
  fillIfEmpty(store, 'contactName', profile.representativeName);
  fillIfEmpty(store, 'contactEmail', profile.contactEmail);
  fillIfEmpty(store, 'address', profile.address);
  fillIfEmpty(store, 'city', profile.city);
  const photos = (profile.documents || []).filter((doc) => doc.type === 'STORE_IMAGE').map((doc) => doc.url).filter(Boolean);
  fillIfEmpty(store, 'gallery', photos.slice(0, 8));
  store.publicSeeded = true;
  await store.save();
  return store;
}

async function loadApprovedMaterialStore(userId) {
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(403, 'This partner is not verified yet');
  }
  const store = await Store.findOne({ contractorId: userId, storeType: STORE_TYPE.MATERIALS });
  if (!store) throw new ApiError(404, 'Store not found');
  return { profile, store: await seedMaterialPublicProfile(store, profile) };
}

async function registeredCategories(profile) {
  const materialCategoryService = require('./material-category.service');
  const rows = await materialCategoryService.categoriesForProfile(profile);
  return rows.map((item) => ({
    name: item.name,
    type: item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM',
    status: item.status || 'APPROVED',
  }));
}

async function getMaterialPublicProfile(userId) {
  const { profile, store } = await loadApprovedMaterialStore(userId);
  const { Material } = require('../models/Material');
  const reviewService = require('./review.service');
  const [materials, reviews] = await Promise.all([
    Material.find({ storeId: store._id, isActive: true }).sort({ name: 1 }),
    reviewService.listForUser(userId, 'MATERIAL_STORE'),
  ]);
  return {
    publicProfile: presentMaterialPublic(store),
    categories: await registeredCategories(profile),
    materials: materials.map((item) => item.toPublic()),
    reviews: {
      average: reviews.average,
      count: reviews.count,
      items: reviews.items.slice(0, 8),
    },
    verified: {
      businessName: profile.businessName || '',
      representativeName: profile.representativeName || '',
      contactEmail: profile.contactEmail || '',
      contactPhone: profile.contactPhone || '',
      taxCode: profile.taxCode || '',
      address: profile.address || '',
      city: profile.city || '',
      verificationStatus: profile.verificationStatus,
      submittedAt: profile.submittedAt,
      reviewedAt: profile.reviewedAt,
    },
  };
}

async function updateMaterialPublicProfile(userId, body) {
  const extra = Object.keys(body).filter((key) => !STORE_PUBLIC_FIELDS.has(key));
  if (extra.length) {
    throw new ApiError(422, 'Verified details cannot be changed from the public profile');
  }
  const { store } = await loadApprovedMaterialStore(userId);
  const map = {
    displayName: 'name',
    slogan: 'slogan',
    description: 'description',
    phone: 'phone',
    contactName: 'contactName',
    contactEmail: 'contactEmail',
    address: 'address',
    city: 'city',
    coverImage: 'coverImage',
    avatar: 'avatar',
    logo: 'logo',
    openingHours: 'openingHours',
    showroomNote: 'showroomNote',
    deliveryNote: 'deliveryNote',
    serviceRadiusKm: 'serviceRadiusKm',
  };
  for (const [incoming, key] of Object.entries(map)) {
    if (body[incoming] !== undefined) store[key] = body[incoming];
  }
  if (Array.isArray(body.gallery)) store.gallery = body.gallery.filter(Boolean).slice(0, 12);
  if (Array.isArray(body.serviceAreas)) store.serviceAreas = body.serviceAreas.filter(Boolean).slice(0, 8);
  assertDeliveryPolicy(store, {});
  store.publicSeeded = true;
  await store.save();
  return presentMaterialPublic(store);
}

async function publicSnapshots(userIds) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return new Map();
  const stores = await Store.find({ contractorId: { $in: ids } });
  const map = new Map();
  for (const store of stores) {
    map.set(String(store.contractorId), {
      ...presentPublicProfile(store),
      profileType: store.storeType === STORE_TYPE.MATERIALS ? 'STORE' : 'CONTRACTOR',
    });
  }
  return map;
}

module.exports = {
  presentPublicProfile,
  loadPublicHighlights,
  seedPublicProfile,
  seedMaterialPublicProfile,
  getPublicProfile,
  updatePublicProfile,
  getMaterialPublicProfile,
  updateMaterialPublicProfile,
  publicSnapshots,
};
