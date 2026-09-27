const {
  ContractorProfile,
  VERIFICATION_STATUS,
  DOCUMENT_TYPE,
} = require('../models/ContractorProfile');
const { User, USER_STATUS } = require('../models/User');
const { Store, STORE_TYPE } = require('../models/Store');
const storeService = require('./store.service');
const { Service } = require('../models/Service');
const { ApiError } = require('../utils/ApiError');
const { ensureContractorProfile } = require('../middleware/contractor.middleware');

const MAX_DOCUMENTS = 8;

async function getProfile(userId) {
  return (await ensureContractorProfile(userId)).toPublic();
}

async function updateProfile(userId, payload) {
  const profile = await ensureContractorProfile(userId);

  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Profile is locked while under review');
  }

  Object.assign(profile, payload);

  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }

  await profile.save();
  const user = await User.findById(userId).select('role');
  if (user?.role === 'CONTRACTOR' && profile.businessName && profile.address) {
    await storeService.syncOwnerStore(userId, STORE_TYPE.SERVICES, {
      name: profile.businessName,
      address: profile.address,
      city: profile.city,
      description: profile.description,
    });
  }
  return profile.toPublic();
}

async function addDocument(userId, file, type) {
  if (!Object.values(DOCUMENT_TYPE).includes(type)) {
    throw new ApiError(400, 'Invalid document type');
  }

  const profile = await ensureContractorProfile(userId);

  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Documents are locked while under review');
  }

  if (profile.documents.length >= MAX_DOCUMENTS) {
    throw new ApiError(400, 'Maximum of 8 verification documents');
  }

  profile.documents.push({
    type,
    url: file.url,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
  });

  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }

  await profile.save();
  return profile.toPublic();
}

async function removeDocument(userId, documentId) {
  const profile = await ensureContractorProfile(userId);
  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Documents are locked while under review');
  }
  profile.documents = profile.documents.filter((d) => d._id.toString() !== documentId);
  await profile.save();
  return profile.toPublic();
}

async function submitVerification(userId) {
  const profile = await ensureContractorProfile(userId);

  if (!profile.businessName || !profile.address) {
    throw new ApiError(400, 'Complete business name and address before submitting');
  }

  if (!profile.documents.length) {
    throw new ApiError(400, 'Upload an ID card or supporting document before submitting');
  }

  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(409, 'Partner is already approved');
  }

  profile.verificationStatus = VERIFICATION_STATUS.SUBMITTED;
  profile.submittedAt = new Date();
  profile.rejectionReason = '';
  await profile.save();

  await User.findByIdAndUpdate(userId, { status: USER_STATUS.PENDING_VERIFICATION });
  return profile.toPublic();
}

async function getMaterialWorkspace(userId) {
  const profile = await ensureContractorProfile(userId);
  await storeService.enforceStoreType(userId, STORE_TYPE.MATERIALS);
  const store = await Store.findOne({ contractorId: userId });
  return {
    profile: profile.toPublic(),
    store: store ? store.toPublic() : null,
    approved: profile.verificationStatus === VERIFICATION_STATUS.APPROVED,
  };
}

async function getWorkspace(userId) {
  const profile = await ensureContractorProfile(userId);
  await storeService.enforceStoreType(userId, STORE_TYPE.SERVICES);
  const store = await Store.findOne({ contractorId: userId });
  const services = store ? await Service.countDocuments({ storeId: store._id }) : 0;

  return {
    profile: profile.toPublic(),
    store: store ? store.toPublic() : null,
    stats: {
      services,
      documents: profile.documents.length,
    },
  };
}

module.exports = {
  getProfile,
  updateProfile,
  addDocument,
  removeDocument,
  submitVerification,
  getWorkspace,
  getMaterialWorkspace,
};
