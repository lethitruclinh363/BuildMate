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
const { MIME_BY_EXT, extensionOf } = require('../utils/upload');
const { ensureContractorProfile } = require('../middleware/contractor.middleware');
const { setProfileStatus, PROFILE_STATUS } = require('./profileStatus.service');
const { servicesBlockReason } = require('../constants/contractor-services');
const catalogService = require('./catalog.service');
const materialCategoryService = require('./material-category.service');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');
const { notify, NOTIFICATION_TYPE } = require('./notification.service');

const MAX_DOCUMENTS = 8;
const VERIFY_SINGLETONS = new Set(['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE', 'CERTIFICATE']);
const VERIFY_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CERT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const PORTFOLIO_SLOTS = {
  avatar: { field: 'avatar', multiple: false, mime: IMAGE_MIME, max: 1 },
  teamLogo: { field: 'teamLogo', multiple: false, mime: IMAGE_MIME, max: 1 },
  workshop: { field: 'workshop', multiple: false, mime: IMAGE_MIME, max: 1 },
  construction: { field: 'construction', multiple: true, mime: IMAGE_MIME, max: 6 },
  certificate: { field: 'certificates', multiple: true, mime: CERT_MIME, max: 4 },
};

function emptyPortfolio() {
  return { avatar: '', teamLogo: '', workshop: '', construction: [], certificates: [] };
}

function resolvedMime(file) {
  const fromName = MIME_BY_EXT[extensionOf(file.originalName || '')];
  return fromName || file.mimeType || '';
}

function assertVerificationEditable(profile) {
  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Profile is locked while under review');
  }
  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(409, 'Verified details can only change through a new review');
  }
}

async function getProfile(userId) {
  const profile = await ensureContractorProfile(userId);
  await catalogService.syncCustomStatuses(profile);
  return profile.toPublic();
}

async function updateProfile(userId, payload) {
  const profile = await ensureContractorProfile(userId);

  assertVerificationEditable(profile);

  const user = await User.findById(userId).select('role');
  const rest = { ...payload };
  delete rest.services;
  delete rest.completedSteps;
  delete rest.materialCategories;
  if (
    user?.role === 'MATERIAL_STORE_OWNER' &&
    (Array.isArray(payload.materialCategories) || Array.isArray(payload.serviceAreas))
  ) {
    const source = Array.isArray(payload.materialCategories) ? payload.materialCategories : payload.serviceAreas;
    const resolved = await materialCategoryService.resolveForOwner(userId, source);
    profile.materialCategories = resolved;
    profile.serviceAreas = resolved.map((item) => item.name);
    profile.markModified('materialCategories');
    profile.markModified('serviceAreas');
    delete rest.serviceAreas;
  }
  Object.assign(profile, rest);
  if (Array.isArray(payload.completedSteps)) {
    const steps = payload.completedSteps.map((flag) => flag === true);
    if (steps[4] === true) {
      const owner = await User.findById(userId).select('role');
      if (!verificationDocsReady(profile, owner?.role)) {
        throw new ApiError(400, 'Verification documents are incomplete');
      }
    }
    profile.completedSteps = steps;
    profile.markModified('completedSteps');
  }
  if (Array.isArray(payload.services)) {
    profile.services = await catalogService.resolveProfileServices(payload.services, profile.services, userId);
    profile.markModified('services');
  }

  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }

  await profile.save();
  if (
    profile.verificationStatus !== VERIFICATION_STATUS.APPROVED &&
    profile.verificationStatus !== VERIFICATION_STATUS.SUBMITTED
  ) {
    await setProfileStatus(userId, PROFILE_STATUS.DRAFT);
  }
  if (
    user?.role === 'CONTRACTOR' &&
    profile.businessName &&
    profile.address &&
    profile.verificationStatus !== VERIFICATION_STATUS.APPROVED
  ) {
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
  assertVerificationEditable(profile);

  if (!file?.url) throw new ApiError(400, 'Choose a file to upload');

  const mime = resolvedMime(file);
  if (VERIFY_SINGLETONS.has(type)) {
    if (file.size > 8 * 1024 * 1024 || !VERIFY_MIME.has(mime)) {
      throw new ApiError(400, 'The file format or size is not valid.');
    }
    profile.documents = profile.documents.filter((doc) => doc.type !== type);
  }

  if (profile.documents.length >= MAX_DOCUMENTS) {
    throw new ApiError(400, 'Maximum of 8 verification documents');
  }

  profile.documents.push({
    type,
    url: file.url,
    originalName: file.originalName,
    mimeType: mime || file.mimeType,
    size: file.size,
  });
  profile.markModified('documents');

  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }

  await profile.save();
  return profile.toPublic();
}

async function removeDocument(userId, documentId) {
  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  profile.documents = profile.documents.filter((d) => d._id.toString() !== documentId);
  await profile.save();
  return profile.toPublic();
}

async function addPortfolioFile(userId, file, slotName) {
  const slot = PORTFOLIO_SLOTS[slotName];
  if (!slot) throw new ApiError(400, 'Choose a portfolio slot');
  if (!file?.url) throw new ApiError(400, 'Choose a file to upload');
  if (file.size > 8 * 1024 * 1024) throw new ApiError(400, 'File is too large');

  const mime = resolvedMime(file);
  if (!slot.mime.has(mime)) {
    throw new ApiError(400, slot.multiple && slotName === 'certificate' ? 'Use a JPG, PNG, WEBP image or a PDF' : 'Use a JPG, PNG, or WEBP image');
  }

  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  if (!profile.portfolio) profile.portfolio = emptyPortfolio();

  if (slot.multiple) {
    const list = profile.portfolio[slot.field] || [];
    if (list.length >= slot.max) {
      throw new ApiError(400, slotName === 'certificate' ? 'You can upload up to 4 certificates' : 'You can upload up to 6 construction photos');
    }
    profile.portfolio[slot.field] = [...list, file.url];
  } else {
    profile.portfolio[slot.field] = file.url;
  }
  profile.markModified('portfolio');

  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }
  await profile.save();
  return profile.toPublic();
}

async function removePortfolioFile(userId, slotName, url) {
  const slot = PORTFOLIO_SLOTS[slotName];
  if (!slot) throw new ApiError(400, 'Choose a portfolio slot');
  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  if (!profile.portfolio) profile.portfolio = emptyPortfolio();
  if (slot.multiple) {
    profile.portfolio[slot.field] = (profile.portfolio[slot.field] || []).filter((item) => item !== url);
  } else if (profile.portfolio[slot.field] === url) {
    profile.portfolio[slot.field] = '';
  }
  profile.markModified('portfolio');
  await profile.save();
  return profile.toPublic();
}

function hasDocument(profile, types) {
  return (profile.documents || []).some((doc) => types.has(doc.type));
}

function hasDocType(profile, type) {
  return (profile.documents || []).some((doc) => doc.type === type);
}

function verificationDocsReady(profile, role) {
  if (!hasDocType(profile, 'CCCD_FRONT') || !hasDocType(profile, 'CCCD_BACK')) return false;
  if (!hasDocType(profile, 'BUSINESS_LICENSE')) return false;
  if (role === 'CONTRACTOR' && !hasDocType(profile, 'CERTIFICATE')) return false;
  return true;
}

function applicationReady(profile, role) {
  if (!profile.businessName || profile.businessName.trim().length < 2) return false;
  if (!profile.address || profile.address.trim().length < 4) return false;
  if (!profile.city || profile.city.trim().length < 2) return false;
  if (!verificationDocsReady(profile, role)) return false;
  if (role === 'CONTRACTOR') {
    return (profile.representativeName || '').trim().length >= 2
      && /^(03|05|07|08|09)\d{8}$/.test(profile.contactPhone || '')
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail || '')
      && (profile.description || '').trim().length >= 1
      && Number(profile.workerCount) >= 1
      && !servicesBlockReason(profile.services)
      && Boolean(profile.portfolio?.avatar)
      && Boolean(profile.portfolio?.teamLogo)
      && Boolean(profile.portfolio?.workshop);
  }
  const categories = profile.materialCategories?.length ? profile.materialCategories : profile.serviceAreas;
  return (profile.description || '').trim().length >= 10
    && (categories || []).length >= 1
    && hasDocument(profile, new Set(['STORE_IMAGE', 'PORTFOLIO']));
}

async function submitVerification(userId, payload) {
  if (payload?.acceptedTerms !== true) {
    throw new ApiError(400, 'You must accept the Terms of Service');
  }

  const profile = await ensureContractorProfile(userId);
  const user = await User.findById(userId).select('role');
  if (user?.role === 'CONTRACTOR') {
    profile.services = await catalogService.resolveProfileServices(profile.services, profile.services, userId);
    profile.markModified('services');
    await catalogService.syncCustomStatuses(profile);
    const serviceReason = servicesBlockReason(profile.services);
    if (serviceReason) throw new ApiError(400, serviceReason);
  }
  if (user?.role === 'MATERIAL_STORE_OWNER') {
    const source = profile.materialCategories?.length ? profile.materialCategories : profile.serviceAreas;
    const resolved = await materialCategoryService.resolveForOwner(userId, source || []);
    profile.materialCategories = resolved;
    profile.serviceAreas = resolved.map((item) => item.name);
    profile.markModified('materialCategories');
    profile.markModified('serviceAreas');
  }

  if (!applicationReady(profile, user?.role)) {
    throw new ApiError(400, 'Complete every onboarding step before submitting');
  }

  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(409, 'Partner is already approved');
  }

  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Profile is locked while under review');
  }

  profile.verificationStatus = VERIFICATION_STATUS.SUBMITTED;
  profile.submittedAt = new Date();
  profile.rejectionReason = '';
  await profile.save();

  await User.findByIdAndUpdate(userId, {
    status: USER_STATUS.PENDING_VERIFICATION,
    profileStatus: PROFILE_STATUS.SUBMITTED,
  });
  return profile.toPublic();
}

async function getMaterialWorkspace(userId) {
  const profile = await ensureContractorProfile(userId);
  await storeService.enforceStoreType(userId, STORE_TYPE.MATERIALS);
  const store = await Store.findOne({ contractorId: userId });
  const activationService = require('./activation.service');
  const activation = await activationService.getActivationReadiness(userId);
  return {
    profile: profile.toPublic(),
    store: store ? store.toPublic() : null,
    approved: profile.verificationStatus === VERIFICATION_STATUS.APPROVED,
    activation,
  };
}

async function requestVerificationChange(userId, note) {
  const profile = await ensureContractorProfile(userId);
  if (profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(409, 'Only a verified partner can request an update');
  }
  const text = String(note || '').trim();
  const actor = await User.findById(userId).select('role');
  const storeOwner = actor?.role === 'MATERIAL_STORE_OWNER' || actor?.role === 'STORE';
  await writeAudit({
    actorId: userId,
    actorRole: storeOwner ? 'MATERIAL_STORE_OWNER' : 'CONTRACTOR',
    action: AUDIT_ACTION.PROFILE_UPDATE,
    entityType: 'ContractorProfile',
    entityId: profile._id,
    meta: { kind: 'verification-change-request', note: text },
  });
  const admins = await User.find({ role: 'ADMIN' }).select('_id');
  await Promise.all(admins.map((admin) => notify({
    userId: admin._id,
    title: 'Verification update requested',
    message: text.slice(0, 400),
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: storeOwner ? '/partners/stores' : '/partners/contractors',
    meta: { contractorId: String(userId), kind: 'verification-change-request' },
  })));
  return { requested: true };
}

async function getWorkspace(userId) {
  const profile = await ensureContractorProfile(userId);
  await catalogService.syncCustomStatuses(profile);
  await storeService.enforceStoreType(userId, STORE_TYPE.SERVICES);
  const store = await Store.findOne({ contractorId: userId });
  const services = store ? await Service.countDocuments({ storeId: store._id }) : 0;
  const activationService = require('./activation.service');
  const activation = await activationService.getActivationReadiness(userId);

  return {
    profile: profile.toPublic(),
    store: store ? store.toPublic() : null,
    stats: {
      services,
      documents: profile.documents.length,
    },
    activation,
  };
}

module.exports = {
  verificationDocsReady,
  getProfile,
  updateProfile,
  addDocument,
  removeDocument,
  addPortfolioFile,
  removePortfolioFile,
  submitVerification,
  requestVerificationChange,
  getWorkspace,
  getMaterialWorkspace,
};
