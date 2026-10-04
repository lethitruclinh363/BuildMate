const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { User, USER_STATUS, ROLES } = require('../models/User');
const { Store, STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { Order } = require('../models/Order');
const { Review } = require('../models/Review');
const { Complaint } = require('../models/Complaint');
const { RepairRequest } = require('../models/RepairRequest');
const { ApiError } = require('../utils/ApiError');
const { writeAudit, listAudit, AUDIT_ACTION } = require('./auditService');
const analyticsService = require('./analyticsService');
const { sendPartnerApprovedEmail } = require('../providers/emailProvider');
const catalogService = require('./catalogService');
const serviceService = require('./serviceService');
const { seedPublicProfile } = require('./publicProfileService');
const commissionService = require('./commissionService');

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
  const users = await User.find({ role: ROLES.CUSTOMER }).sort({ createdAt: -1 });
  const locations = await customerLocations(users.map((user) => user._id));
  return users.map((user) => customerPublic(user, locations.get(String(user._id))));
}

async function getCustomer(id) {
  const user = await User.findById(id);
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

  const profiles = await ContractorProfile.find(filter)
    .sort({ submittedAt: -1, updatedAt: -1 })
    .populate('userId', 'name email phone avatar status role');
  const categoriesByProfile = await materialCategoryService.selectionsForProfiles(profiles);
  const snapshots = await publicSnapshots(profiles.map((profile) => profile.userId?._id || profile.userId));

  return Promise.all(profiles.map(async (profile) => {
    const published = profile.toPublic();
    const categories = categoriesByProfile.get(String(profile._id));
    if (categories) published.materialCategories = categories;
    const ownerId = String(profile.userId?._id || profile.userId || '');
    const snapshot = snapshots.get(ownerId);
    if (snapshot) published.publicProfile = snapshot;
    const activation = ownerId ? await activationService.getActivationReadiness(ownerId) : null;
    return {
      ...published,
      activation,
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
  }));
}

async function getVerification(id) {
  const profile = await ContractorProfile.findById(id).populate(
    'userId',
    'name email phone avatar status role'
  );
  if (!profile) throw new ApiError(404, 'Partner application not found');
  const { Service } = require('../models/Service');
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

  return {
    activation,
    ...published,
    services: (published.services || []).map((item) => ({
      ...item,
      completionStatus: completionByKey.get(String(item.serviceId || '')) || completionByKey.get(String(item.name || '')) || null,
    })),
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

async function approve(id, adminId) {
  const profile = await ContractorProfile.findById(id);
  if (!profile) throw new ApiError(404, 'Partner application not found');
  if (profile.verificationStatus !== VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Only submitted applications can be approved');
  }

  profile.verificationStatus = VERIFICATION_STATUS.APPROVED;
  profile.reviewedAt = new Date();
  profile.reviewedBy = adminId;
  profile.rejectionReason = '';
  await profile.save();

  const user = await User.findByIdAndUpdate(
    profile.userId,
    { status: USER_STATUS.ACTIVE, profileStatus: 'APPROVED' },
    { new: true }
  );
  const storeType = user?.role === ROLES.MATERIAL_STORE_OWNER ? STORE_TYPE.MATERIALS : STORE_TYPE.SERVICES;
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
    });
  } else {
    existing.storeType = storeType;
    existing.status = STORE_STATUS.INACTIVE;
    existing.verified = true;
    if (!existing.publicSeeded) {
      if (profile.businessName) existing.name = profile.businessName;
      if (profile.address) existing.address = profile.address;
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
  await profile.save();

  await User.findByIdAndUpdate(profile.userId, {
    status: USER_STATUS.PENDING_VERIFICATION,
    profileStatus: 'REJECTED',
  });
  await Store.findOneAndUpdate(
    { contractorId: profile.userId },
    { status: STORE_STATUS.DRAFT, verified: false }
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
  listVerifications,
  getVerification,
  approve,
  reject,
  adminStats,
  listAudit,
  analytics,
  getCommissionRule,
  setCommissionRule,
};
