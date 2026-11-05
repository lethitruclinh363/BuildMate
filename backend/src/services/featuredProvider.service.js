const { STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ContractorProfile, Store } = require('../repositories/partnerAccess');
const { USER_STATUS } = require('../models/User');
const { Service, Material } = require('../repositories/offeringAccess');
const { RepairRequest } = require('../repositories/conversationAccess');
const { REVIEW_TARGET } = require('../models/Review');
const { COMPLAINT_STATUS } = require('../models/Complaint');
const { Order, Review, Complaint } = require('../repositories/commerceAccess');
const { userRepository } = require('../repositories/userRepository');
const { publicPricedServiceMatch } = require('../constants/contractorServices');
const { ORDER_STATUS } = require('../utils/order.rules');
const score = require('./featuredScore');
const activationService = require('./activation.service');

const CACHE_MS = 8 * 60 * 1000;
const COMPLETED_JOBS = [ORDER_STATUS.COMPLETED, ORDER_STATUS.CUSTOMER_ACCEPTED];
const ACCEPTED_JOBS = [
  ORDER_STATUS.QUOTATION_ACCEPTED,
  ORDER_STATUS.DEPOSIT_PAID,
  ORDER_STATUS.STARTED,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CUSTOMER_ACCEPTED,
  ORDER_STATUS.CANCELLED,
];

let cache = { at: 0, data: null };

function clearFeaturedCache() {
  cache = { at: 0, data: null };
}

function indexBy(rows, key) {
  const map = new Map();
  for (const row of rows) map.set(String(row[key]), row);
  return map;
}

async function loadSignals(stores) {
  const storeIds = stores.map((store) => store._id);
  const ownerIds = stores.map((store) => store.contractorId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [services, materials, orders, reviews, complaints, requests] = await Promise.all([
    Service.aggregate([
      { $match: { storeId: { $in: storeIds }, ...publicPricedServiceMatch() } },
      { $group: { _id: '$storeId', count: { $sum: 1 }, categories: { $addToSet: '$category' } } },
    ]),
    Material.aggregate([
      { $match: { storeId: { $in: storeIds }, isActive: true } },
      { $group: { _id: '$storeId', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { contractorId: { $in: ownerIds } } },
      {
        $group: {
          _id: '$contractorId',
          completed: { $sum: { $cond: [{ $in: ['$status', COMPLETED_JOBS] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.CANCELLED] }, 1, 0] } },
          accepted: { $sum: { $cond: [{ $in: ['$status', ACCEPTED_JOBS] }, 1, 0] } },
          recent: { $sum: { $cond: [{ $gte: ['$updatedAt', since] }, 1, 0] } },
        },
      },
    ]),
    Review.aggregate([
      {
        $facet: {
          byTarget: [
            {
              $group: {
                _id: { user: '$targetUserId', type: '$targetType' },
                average: { $avg: '$rating' },
                count: { $sum: 1 },
              },
            },
          ],
          global: [{ $group: { _id: '$targetType', average: { $avg: '$rating' } } }],
        },
      },
    ]),
    Complaint.aggregate([
      { $match: { againstUser: { $in: ownerIds }, status: { $ne: COMPLAINT_STATUS.REJECTED } } },
      { $group: { _id: '$againstUser', count: { $sum: 1 } } },
    ]),
    RepairRequest.aggregate([
      { $match: { contractorId: { $in: ownerIds } } },
      {
        $group: {
          _id: '$contractorId',
          total: { $sum: 1 },
          answered: {
            $sum: {
              $cond: [{ $in: ['$status', ['ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED']] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);
  const reviewFacet = reviews[0] || { byTarget: [], global: [] };
  return {
    services: indexBy(services, '_id'),
    materials: indexBy(materials, '_id'),
    orders: indexBy(orders, '_id'),
    complaints: indexBy(complaints, '_id'),
    requests: indexBy(requests, '_id'),
    reviews: reviewFacet.byTarget,
    globalAverage: Object.fromEntries(reviewFacet.global.map((row) => [row._id, row.average])),
  };
}

function reviewOf(signals, userId, type) {
  const hit = signals.reviews.find(
    (row) => String(row._id.user) === String(userId) && row._id.type === type
  );
  return {
    average: hit ? Math.round(hit.average * 10) / 10 : 0,
    count: hit ? hit.count : 0,
    global: Number(signals.globalAverage[type]) || 4,
  };
}

function toCandidate(store, profile, user, signals) {
  const service = signals.services.get(String(store._id)) || { count: 0, categories: [] };
  const material = signals.materials.get(String(store._id)) || { count: 0 };
  const jobs = signals.orders.get(String(store.contractorId)) || {};
  const requests = signals.requests.get(String(store.contractorId)) || {};
  const complaints = signals.complaints.get(String(store.contractorId)) || { count: 0 };
  const materialStore = store.storeType === STORE_TYPE.MATERIALS;
  const reviews = reviewOf(
    signals,
    store.contractorId,
    materialStore ? REVIEW_TARGET.MATERIAL_STORE : REVIEW_TARGET.CONTRACTOR
  );
  const completeness = score.profileCompleteness(store, {
    serviceCount: service.count,
    productCount: material.count,
  });
  return {
    id: materialStore ? String(store._id) : String(store.contractorId),
    storeId: String(store._id),
    name: store.name,
    avatar: store.avatar || store.logo || '',
    image: store.coverImage || store.logo || store.avatar || '',
    services: (service.categories || []).filter(Boolean).slice(0, 3),
    verified: true,
    deliveryEnabled: Boolean(store.deliveryEnabled),
    rating: reviews.count ? reviews.average : null,
    reviewCount: reviews.count,
    completedJobs: jobs.completed || 0,
    completedOrders: 0,
    productCount: material.count || 0,
    averageRating: reviews.average,
    globalAverageRating: reviews.global,
    acceptedJobs: jobs.accepted || 0,
    acceptedOrders: 0,
    cancelled: materialStore ? 0 : jobs.cancelled || 0,
    complaints: complaints.count || 0,
    responseRate: requests.total ? (requests.answered / requests.total) * 100 : null,
    recentActivity: jobs.recent || 0,
    profileCompleteness: completeness,
    verificationStatus: profile.verificationStatus,
    storeStatus: store.status,
    accountStatus: user.status,
    storeType: store.storeType,
    createdAt: store.createdAt || profile.createdAt,
  };
}

function publicContractor(row) {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    rating: row.rating,
    reviewCount: row.reviewCount,
    completedJobs: row.completedJobs,
    services: row.services,
    verified: row.verified,
  };
}

function publicStore(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    rating: row.rating,
    reviewCount: row.reviewCount,
    completedOrders: row.completedOrders,
    verified: row.verified,
    deliveryEnabled: row.deliveryEnabled,
  };
}

async function loadCandidates() {
  const stores = await Store.find({ status: STORE_STATUS.LIVE }).lean();
  if (!stores.length) return [];
  const [profiles, users] = await Promise.all([
    ContractorProfile.find({
      userId: { $in: stores.map((store) => store.contractorId) },
      verificationStatus: VERIFICATION_STATUS.APPROVED,
    }).lean(),
    userRepository.findManyByIds(
      stores.map((store) => store.contractorId),
      { excludeStatuses: [USER_STATUS.BLOCKED, USER_STATUS.BANNED, USER_STATUS.INACTIVE] }
    ),
  ]);
  const profileByUser = indexBy(profiles, 'userId');
  const userById = indexBy(users, '_id');
  const visible = stores.filter(
    (store) => profileByUser.has(String(store.contractorId)) && userById.has(String(store.contractorId))
  );
  if (!visible.length) return [];
  const entries = visible.map((store) => ({
    userId: store.contractorId,
    user: userById.get(String(store.contractorId)),
    profile: profileByUser.get(String(store.contractorId)),
    store,
  }));
  const categoriesByProfile = new Map();
  for (const entry of entries) {
    if (!entry.profile) continue;
    if (entry.store?.storeType === STORE_TYPE.MATERIALS || entry.user?.role === 'MATERIAL_STORE_OWNER') {
      categoriesByProfile.set(
        String(entry.profile._id),
        Array.isArray(entry.profile.materialCategories) ? entry.profile.materialCategories : []
      );
    }
  }
  const readiness = await activationService.readinessForLoaded(entries, categoriesByProfile);
  const publicStores = visible.filter((store) => readiness.get(String(store.contractorId))?.visible);
  if (!publicStores.length) return [];
  const signals = await loadSignals(publicStores);
  return publicStores.map((store) => {
    const gate = readiness.get(String(store.contractorId));
    return {
      ...toCandidate(
        store,
        profileByUser.get(String(store.contractorId)),
        userById.get(String(store.contractorId)),
        signals
      ),
      profileReady: Boolean(gate?.profileReady),
      visible: Boolean(gate?.visible),
    };
  });
}

async function getFeaturedProviders() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const candidates = await loadCandidates();
  const contractors = score.selectFeatured(
    candidates.filter((row) => row.storeType !== STORE_TYPE.MATERIALS),
    score.contractorFeaturedScore
  );
  const stores = score.selectFeatured(
    candidates.filter((row) => row.storeType === STORE_TYPE.MATERIALS),
    score.storeFeaturedScore
  );
  const data = {
    contractors: contractors.items.map(publicContractor),
    stores: stores.items.map(publicStore),
  };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getFeaturedProviders, clearFeaturedCache };
