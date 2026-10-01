const { User, ROLES, PROFILE_STATUS } = require('../models/user.model');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');

const PARTNER_ROLES = new Set([ROLES.CONTRACTOR, ROLES.MATERIAL_STORE_OWNER]);

function isPartnerRole(role) {
  return PARTNER_ROLES.has(role);
}

async function resolveProfileStatus(user) {
  if (!user || !isPartnerRole(user.role)) return PROFILE_STATUS.APPROVED;
  const profile = await ContractorProfile.findOne({ userId: user._id });
  if (profile?.verificationStatus === VERIFICATION_STATUS.APPROVED) return PROFILE_STATUS.APPROVED;
  if (profile?.verificationStatus === VERIFICATION_STATUS.REJECTED) return PROFILE_STATUS.REJECTED;
  if (profile?.verificationStatus === VERIFICATION_STATUS.SUBMITTED) return PROFILE_STATUS.SUBMITTED;
  if (user.profileStatus === PROFILE_STATUS.SUBMITTED) return PROFILE_STATUS.SUBMITTED;
  if (profile?.businessName || profile?.address || user.profileStatus === PROFILE_STATUS.DRAFT) {
    return PROFILE_STATUS.DRAFT;
  }
  return PROFILE_STATUS.INCOMPLETE;
}

async function syncUserProfileStatus(user) {
  if (!user) return user;
  const next = await resolveProfileStatus(user);
  if (user.profileStatus !== next) {
    user.profileStatus = next;
    await user.save();
  }
  return user;
}

async function setProfileStatus(userId, status) {
  await User.findByIdAndUpdate(userId, { profileStatus: status });
}

module.exports = {
  PROFILE_STATUS,
  isPartnerRole,
  resolveProfileStatus,
  syncUserProfileStatus,
  setProfileStatus,
};
