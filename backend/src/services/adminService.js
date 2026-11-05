const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ContractorProfile, Store, loadUser, updateUser, findUsersByIds } = require('../repositories/partnerAccess');
const { USER_STATUS, ROLES } = require('../models/User');
const { userRepository } = require('../repositories/userRepository');
const { STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { Order, Review, Complaint } = require('../repositories/commerceAccess');
const { RepairRequest } = require('../repositories/conversationAccess');
const { ApiError } = require('../utils/ApiError');
const { writeAudit, listAudit, AUDIT_ACTION } = require('./auditService');
const analyticsService = require('./analyticsService');
const { sendPartnerApprovedEmail } = require('../providers/emailProvider');
const catalogService = require('./catalogService');
const serviceService = require('./serviceService');
const { seedPublicProfile, publicSnapshots } = require('./publicProfileService');
const commissionService = require('./commissionService');
const materialCategoryService = require('./material-category.service');
const activationService = require('./activation.service');
const contractorEkycService = require('./contractorEkycService');
const { assertCanReadVerificationDoc } = require('../utils/verification-docs');
const verificationStorage = require('./verificationStorage');
const { normalizeWeeklyHours, summarizeWeeklyHours, hoursStatus, toOperatingHours } = require('../utils/weeklyHours');

function customerPublic(user, city = '') {
  return {
    ...user.toPublic(),
    city: city || '',
  };
}

async function customerLocations(userIds) {
  const requests = await RepairRequest.find({ customerId: { $in: userIds } })
    .select('customerId address')
    .sort({ createdAt: -1 });
  const byUser = new Map();
  for (const row of requests) {
    const key = String(row.customerId);
    if (!byUser.has(key) && row.address) byUser.set(key, row.address);
  }
  return byUser;
}

async function listCustomers() {
  const users = await userRepository.listByRole(ROLES.CUSTOMER);
  const locations = await customerLocations(users.map((user) => user._id));
  return users.map((user) => customerPublic(user, locations.get(String(user._id))));
}

async function getCustomer(id) {
  const user = await userRepository.findById(id);
  if (!user || user.role !== ROLES.CUSTOMER) {
    throw new ApiError(404, 'Customer not found');
  }
  const [orders, reviews, complaints, locations] = await Promise.all([
    Order.find({ customerId: user._id }).sort({ createdAt: -1 }),
    Review.find({ customerId: user._id }).sort({ createdAt: -1 }),
    Complaint.find({ createdBy: user._id }).sort({ createdAt: -1 }),
    customerLocations([user._id]),
  ]);
  return {
    user: customerPublic(user, locations.get(String(user._id))),
    orders: orders.map((row) => row.toPublic()),
    reviews: reviews.map((row) => row.toPublic()),
    complaints: complaints.map((row) => row.toPublic()),
  };
}

async function listVerifications(status) {
  const filter = {};
  if (status) filter.verificationStatus = status;

  const profiles = await ContractorProfile.find(filter).sort({ submittedAt: -1, updatedAt: -1 });
  const ownerIds = profiles.map((profile) => String(profile.userId || '')).filter(Boolean);
  const [users, stores, ekycByUser] = await Promise.all([
    findUsersByIds(ownerIds),
    ownerIds.length ? Store.find({ contractorId: { $in: ownerIds } }) : [],
    contractorEkycService.publicByUserIds(ownerIds),
  ]);
  const userById = new Map(users.map((user) => [String(user._id), user]));
  for (const profile of profiles) {
    const user = userById.get(String(profile.userId || ''));
    if (!user) continue;
    profile.userId = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      role: user.role,
    };
  }
  const storeByOwner = new Map(stores.map((store) => [String(store.contractorId), store]));
  const categoryProfiles = profiles.filter((profile) => {
    const ownerId = String(profile.userId?._id || profile.userId || '');
    const store = storeByOwner.get(ownerId);
    return profile.userId?.role === ROLES.MATERIAL_STORE_OWNER || store?.storeType === STORE_TYPE.MATERIALS;
  });
  const categoriesByProfile = categoryProfiles.length
    ? await materialCategoryService.selectionsForProfiles(categoryProfiles, { includeAll: true })
    : new Map();
  const entries = profiles.map((profile) => {
    const ownerId = String(profile.userId?._id || profile.userId || '');
    return {
      userId: ownerId,
      profile,
      user: profile.userId?._id ? profile.userId : null,
      store: storeByOwner.get(ownerId) || null,
    };
  });
  const [snapshots, readiness] = await Promise.all([
    publicSnapshots(ownerIds, stores),
    activationService.readinessForLoaded(entries, categoriesByProfile),
  ]);

  return profiles.map((profile) => {
    const published = profile.toPublic();
    const ownerId = String(profile.userId?._id || profile.userId || '');
    if (profile.userId?.role === ROLES.MATERIAL_STORE_OWNER) {
      const categories = categoriesByProfile.get(String(profile._id));
      if (categories) published.materialCategories = categories;
    }
    const snapshot = snapshots.get(ownerId);
    if (snapshot) published.publicProfile = snapshot;
    return {
      ...published,
      activation: ownerId ? readiness.get(ownerId) || null : null,
      ekyc: ekycByUser.get(ownerId) || null,
      user: profile.userId?._id
        ? {
            id: profile.userId._id,
            name: profile.userId.name,
            email: profile.userId.email,
            phone: profile.userId.phone,
            avatar: profile.userId.avatar,
            status: profile.userId.status,
            role: profile.userId.role,
          }
        : null,
    };
  });
}

function publicStoreSummary(store, weeklyHours) {
  if (!store) return null;
  const pub = store.toPublic();
  const hours = normalizeWeeklyHours(weeklyHours);
  return {
    id: pub.id,
    name: pub.name,
    description: pub.description,
    phone: pub.phone,
    address: pub.address,
    city: pub.city,
    storeType: pub.storeType,
    coverImage: pub.coverImage,
    avatar: pub.avatar,
    logo: pub.logo,
    gallery: pub.gallery || [],
    crewPhotos: pub.crewPhotos || [],
    showroomNote: pub.showroomNote,
    deliveryNote: pub.deliveryNote,
    deliveryEnabled: Boolean(pub.deliveryEnabled),
    serviceAreas: pub.serviceAreas || [],
    serviceRadiusKm: pub.serviceRadiusKm,
    openingHours: hours.configured ? summarizeWeeklyHours(hours) : '',
    weeklyHours: hours,
    operatingHours: toOperatingHours(hours),
    hoursStatus: hoursStatus(hours),
    status: pub.status,
    rating: pub.rating,
    reviewCount: pub.reviewCount,
    materialRating: pub.materialRating,
    materialReviewCount: pub.materialReviewCount,
    lat: pub.lat,
    lng: pub.lng,
  };
}

function publicMaterialSummary(row) {
  const pub = row.toPublic();
  return {
    id: pub.id,
    name: pub.name,
    category: pub.category,
    unit: pub.unit,
    price: pub.price,
    image: pub.image,
    isActive: pub.isActive,
    saleState: pub.saleState,
  };
}

async function getVerification(id) {
  const profile = await ContractorProfile.findById(id).populate(
    'userId',
    'name email phone avatar status role'
  );
  if (!profile) throw new ApiError(404, 'Partner application not found');
  const { Service, Material } = require('../repositories/offeringAccess');
  const userId = profile.userId?._id || profile.userId;
  const offerings = userId ? await Service.find({ contractorId: userId }).select('catalogKey name completionStatus') : [];
  const completionByKey = new Map();
  for (const offering of offerings) {
    if (offering.catalogKey) completionByKey.set(String(offering.catalogKey), offering.completionStatus);
    if (offering.name) completionByKey.set(String(offering.name), offering.completionStatus);
  }
  const published = profile.toPublic();
  const categoriesByProfile = await materialCategoryService.selectionsForProfiles([profile]);
  const categories = categoriesByProfile.get(String(profile._id));
  if (categories) published.materialCategories = categories;
  const snapshots = await publicSnapshots([profile.userId?._id || profile.userId]);
  const snapshot = snapshots.get(String(profile.userId?._id || profile.userId || ''));
  if (snapshot) published.publicProfile = snapshot;
  const activation = userId ? await activationService.getActivationReadiness(userId) : null;
  const ekycMap = userId ? await contractorEkycService.publicByUserIds([userId]) : new Map();
  const store = userId ? await Store.findOne({ contractorId: userId }) : null;
  const isMaterialOwner =
    profile.userId?.role === ROLES.MATERIAL_STORE_OWNER || store?.storeType === STORE_TYPE.MATERIALS;
  const materialRows =
    store && isMaterialOwner ? await Material.find({ storeId: store._id }).sort({ createdAt: -1 }).limit(40) : [];

  return {
    activation,
    ekyc: ekycMap.get(String(userId)) || null,
    ...published,
    services: (published.services || []).map((item) => ({
      ...item,
      completionStatus: completionByKey.get(String(item.serviceId || '')) || completionByKey.get(String(item.name || '')) || null,
    })),
    store: publicStoreSummary(store, profile.weeklyHours),
    materials: materialRows.map(publicMaterialSummary),
    user: profile.userId
      ? {
          id: profile.userId._id,
          name: profile.userId.name,
          email: profile.userId.email,
          phone: profile.userId.phone,
          avatar: profile.userId.avatar,
          status: profile.userId.status,
          role: profile.userId.role,
        }
      : null,
  };
}

async function openDocumentFile(profileId, documentId, actor) {
  const profile = await ContractorProfile.findById(profileId);
  if (!profile) throw new ApiError(404, 'Partner application not found');
  assertCanReadVerificationDoc({
    role: actor?.role || 'ADMIN',
    userId: actor?.id || actor?.userId,
    ownerId: String(profile.userId),
  });
  const doc = (profile.documents || []).find((item) => String(item._id) === String(documentId));
  if (!doc) throw new ApiError(404, 'Document not found');
  const ekycUrl = String(doc.url || '');
  if (ekycUrl.startsWith('private:ekyc:')) {
    return contractorEkycService.openForAdmin(profileId, ekycUrl.slice('private:ekyc:'.length));
  }
  return verificationStorage.openFromUrl(doc.url, doc.mimeType);
}

async function approve(id, adminId) {
  const profile = await ContractorProfile.findById(id);
  if (!profile) throw new ApiError(404, 'Partner application not found');
  if (profile.verificationStatus !== VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Only submitted applications can be approved');
  }

  const approvalDate = new Date();
  profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
  profile.reviewedAt = approvalDate;
  profile.reviewedBy = adminId;
  profile.rejectionReason = '';
  profile.locationApprovedAt = approvalDate;
  await profile.save();
  try {
    await contractorEkycService.recordAdminDecision(profile.userId, adminId, 'APPROVE');
  } catch (err) {
    console.error('[ekyc] admin decision was not recorded');
  }

  const user = await updateUser(profile.userId, {
    status: USER_STATUS.ACTIVE,
    profileStatus: 'APPROVED',
  });
  const storeType = user?.role === ROLES.MATERIAL_STORE_OWNER ? STORE_TYPE.MATERIALS : STORE_TYPE.SERVICES;

  const rawLat = profile.lat !== undefined && profile.lat !== null ? profile.lat : profile.latitude;
  const rawLng = profile.lng !== undefined && profile.lng !== null ? profile.lng : profile.longitude;
  const hasCoordinates = rawLat != null && rawLng != null && Number.isFinite(Number(rawLat)) && Number.isFinite(Number(rawLng));
  const approvedLat = hasCoordinates ? Number(rawLat) : null;
  const approvedLng = hasCoordinates ? Number(rawLng) : null;

  const storeLocationData = hasCoordinates
    ? {
        location: { type: 'Point', coordinates: [approvedLng, approvedLat] },
        lat: approvedLat,
        lng: approvedLng,
        locationConfirmed: true,
        locationSource: profile.locationSource || 'VIETMAP_PLACE',
        locationConfirmedAt: profile.locationConfirmedAt || approvalDate,
        locationApprovedAt: approvalDate,
        providerRefId: profile.providerRefId || null,
      }
    : {
        locationApprovedAt: approvalDate,
      };

  const existing = await Store.findOne({ contractorId: profile.userId });
  if (!existing) {
    await Store.create({
      contractorId: profile.userId,
      name: profile.businessName || 'BuildMate partner',
      address: profile.address || '',
      city: profile.city || 'Can Tho',
      description: profile.description || '',
      storeType,
      status: STORE_STATUS.INACTIVE,
      verified: true,
      ...storeLocationData,
    });
  } else {
    existing.storeType = storeType;
    existing.status = STORE_STATUS.INACTIVE;
    existing.verified = true;
    if (!existing.publicSeeded) {
      if (profile.businessName) existing.name = profile.businessName;
      if (profile.address) existing.address = profile.address;
      if (profile.city) existing.city = profile.city;
    }
    if (hasCoordinates) {
      existing.location = { type: 'Point', coordinates: [approvedLng, approvedLat] };
      existing.lat = approvedLat;
      existing.lng = approvedLng;
      existing.locationConfirmed = true;
      existing.locationSource = profile.locationSource || 'VIETMAP_PLACE';
      existing.locationConfirmedAt = profile.locationConfirmedAt || approvalDate;
      existing.locationApprovedAt = approvalDate;
      existing.providerRefId = profile.providerRefId || null;
    } else {
      existing.locationApprovedAt = approvalDate;
    }
    await existing.save();
  }
  const liveStore = existing || (await Store.findOne({ contractorId: profile.userId }));
  if (liveStore && storeType !== STORE_TYPE.MATERIALS) {
    await seedPublicProfile(liveStore, profile);
  }
  if (storeType === STORE_TYPE.SERVICES && liveStore) {
    await catalogService.syncCustomStatuses(profile);
    await serviceService.ensureContractorOfferings(liveStore, profile);
  }
  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.ADMIN_APPROVE,
    entityType: 'ContractorProfile',
    entityId: profile._id,
    meta: { userId: String(profile.userId), businessName: profile.businessName },
  });
  if (user?.email) {
    try {
      await sendPartnerApprovedEmail({
        to: user.email,
        name: user.name,
        language: user.preferredLanguage === 'en' ? 'en' : 'vi',
      });
    } catch (err) {
      console.error('[email] partner approval failed', err);
    }
  }
  return getVerification(id);
}

async function reject(id, adminId, reason) {
  const profile = await ContractorProfile.findById(id);
  if (!profile) throw new ApiError(404, 'Partner application not found');
  if (profile.verificationStatus !== VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Only submitted applications can be rejected');
  }

  profile.verificationStatus = VERIFICATION_STATUS.REJECTED;
  profile.reviewedAt = new Date();
  profile.reviewedBy = adminId;
  profile.rejectionReason = reason;
  profile.locationApprovedAt = null;
  await profile.save();
  try {
    await contractorEkycService.recordAdminDecision(profile.userId, adminId, 'REJECT', reason);
  } catch (err) {
    console.error('[ekyc] admin decision was not recorded');
  }

  await updateUser(profile.userId, {
    status: USER_STATUS.PENDING_VERIFICATION,
    profileStatus: 'REJECTED',
  });
  await Store.findOneAndUpdate(
    { contractorId: profile.userId },
    { status: STORE_STATUS.DRAFT, verified: false, locationApprovedAt: null }
  );
  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.ADMIN_REJECT,
    entityType: 'ContractorProfile',
    entityId: profile._id,
    meta: { userId: String(profile.userId), reason },
  });
  return getVerification(id);
}

async function listRepairOrders() {
  const rows = await Order.find({}).sort({ createdAt: -1 }).limit(200);
  return rows.map((row) => (typeof row.toPublic === 'function' ? row.toPublic() : row));
}

async function adminStats() {
  const [pending, approved, rejected, draft] = await Promise.all([
    ContractorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.SUBMITTED }),
    ContractorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.APPROVED }),
    ContractorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.REJECTED }),
    ContractorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.DRAFT }),
  ]);
  return { pending, approved, rejected, draft };
}

async function analytics() {
  return analyticsService.getAnalytics();
}

async function getCommissionRule() {
  const rule = await commissionService.getActiveRule();
  return rule.toPublic();
}

async function setCommissionRule(body, adminId) {
  const rule = await commissionService.setActivePercentage(body.percentage, body.name || 'Platform fee');
  await writeAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: AUDIT_ACTION.FEE_CHANGED,
    entityType: 'CommissionRule',
    entityId: rule.id,
    meta: { percentage: body.percentage },
  });
  return rule;
}

module.exports = {
  listCustomers,
  getCustomer,
  listRepairOrders,
  listVerifications,
  getVerification,
  openDocumentFile,
  approve,
  reject,
  adminStats,
  listAudit,
  analytics,
  getCommissionRule,
  setCommissionRule,
};
