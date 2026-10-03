const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Store } = require('../models/Store');
const { ApiError } = require('../utils/ApiError');
const { asyncHandler } = require('../utils/asyncHandler');

async function ensureContractorProfile(userId) {
  let profile = await ContractorProfile.findOne({ userId });
  if (!profile) {
    profile = await ContractorProfile.create({ userId });
  }
  return profile;
}

const loadContractorProfile = asyncHandler(async (req, _res, next) => {
  req.contractorProfile = await ensureContractorProfile(req.user.id);
  next();
});

const requireApprovedContractor = asyncHandler(async (req, _res, next) => {
  const profile = req.contractorProfile || (await ensureContractorProfile(req.user.id));
  req.contractorProfile = profile;

  if (profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(
      403,
      'Partner verification must be approved before managing store data'
    );
  }
  next();
});

const loadStore = asyncHandler(async (req, _res, next) => {
  const store = await Store.findOne({ contractorId: req.user.id });
  req.store = store || null;
  next();
});

const requireStore = asyncHandler(async (req, _res, next) => {
  const store = req.store || (await Store.findOne({ contractorId: req.user.id }));
  if (!store) {
    throw new ApiError(400, 'Create your storefront before adding catalog items');
  }
  req.store = store;
  next();
});

module.exports = {
  ensureContractorProfile,
  loadContractorProfile,
  requireApprovedContractor,
  loadStore,
  requireStore,
};
