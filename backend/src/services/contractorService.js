const { VERIFICATION_STATUS, DOCUMENT_TYPE } = require('../models/ContractorProfile');
const { USER_STATUS } = require('../models/User');
const { STORE_TYPE } = require('../models/Store');
const { ContractorProfile, Store, loadUser, updateUser, findUsersByRole } = require('../repositories/partnerAccess');
const storeService = require('./storeService');
const { Service } = require('../repositories/offeringAccess');
const { ApiError } = require('../utils/ApiError');
const { MIME_BY_EXT, extensionOf } = require('../utils/upload');
const { ensureContractorProfile } = require('../middleware/contractorMiddleware');
const { setProfileStatus, PROFILE_STATUS } = require('./profileStatusService');
const { EKYC_STATUS } = require('./ekycStatus');
const { servicesBlockReason } = require('../constants/contractorServices');
const catalogService = require('./catalogService');
const materialCategoryService = require('./material-category.service');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { assertCanReadVerificationDoc } = require('../utils/verification-docs');
const { isLocationPayloadPresent, LOCATION_LOCKED_MESSAGE } = require('../utils/locationGuard');
const {
  parseWeeklyHours,
  persistableWeeklyHours,
  summarizeWeeklyHours,
  applyAccountContact,
} = require('../utils/weeklyHours');
const verificationStorage = require('./verificationStorage');
const {
  MAX_PROJECTS,
  MAX_PROJECT_IMAGES,
  findRegisteredService,
  registeredServiceId,
  firstProjectIssue,
  projectIssueMessage,
  imageAllowed,
} = require('./portfolioProjects');

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
  return { avatar: '', teamLogo: '', workshop: '', construction: [], certificates: [], projects: [] };
}

function resolvedMime(file) {
  const fromName = MIME_BY_EXT[extensionOf(file.originalName || '')];
  return fromName || file.mimeType || '';
}

function assertVerificationEditable(profile, payload) {
  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Profile is locked while under review');
  }
  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    if (payload && isLocationPayloadPresent(payload)) {
      throw new ApiError(409, LOCATION_LOCKED_MESSAGE);
    }
    throw new ApiError(409, 'Verified details can only change through a new review');
  }
}

function hoursOnlyPayload(payload) {
  if (!payload || payload.weeklyHours === undefined) return false;
  return Object.keys(payload).every((key) =>
    ['weeklyHours', 'contactPhone', 'contactEmail', 'openingHours'].includes(key)
  );
}

async function syncStoreHoursSummary(userId, weeklyHours) {
  const store = await Store.findOne({ contractorId: userId });
  if (!store) return;
  store.openingHours = summarizeWeeklyHours(weeklyHours);
  await store.save();
}

async function getProfile(userId) {
  const profile = await ensureContractorProfile(userId);
  const user = await loadUser(userId);
  applyAccountContact(profile, user);
  await catalogService.syncCustomStatuses(profile);
  return profile.toPublic();
}

async function updateProfile(userId, payload) {
  const profile = await ensureContractorProfile(userId);
  const user = await loadUser(userId);

  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED && hoursOnlyPayload(payload)) {
    profile.weeklyHours = persistableWeeklyHours(parseWeeklyHours(payload.weeklyHours));
    applyAccountContact(profile, user);
    await profile.save();
    await syncStoreHoursSummary(userId, profile.weeklyHours);
    return profile.toPublic();
  }

  assertVerificationEditable(profile, payload);

  const rest = { ...payload };
  delete rest.services;
  delete rest.completedSteps;
  delete rest.materialCategories;
  delete rest.lat;
  delete rest.lng;
  delete rest.latitude;
  delete rest.longitude;
  delete rest.locationConfirmed;
  delete rest.locationSource;
  delete rest.providerRefId;
  delete rest.contactPhone;
  delete rest.contactEmail;
  delete rest.weeklyHours;
  delete rest.openingHours;

  if (payload.lat !== undefined || payload.latitude !== undefined) {
    const rawLat = payload.lat !== undefined ? payload.lat : payload.latitude;
    profile.lat = rawLat != null ? Number(rawLat) : null;
    profile.latitude = profile.lat;
  }
  if (payload.lng !== undefined || payload.longitude !== undefined) {
    const rawLng = payload.lng !== undefined ? payload.lng : payload.longitude;
    profile.lng = rawLng != null ? Number(rawLng) : null;
    profile.longitude = profile.lng;
  }
  if (payload.locationConfirmed !== undefined) {
    profile.locationConfirmed = Boolean(payload.locationConfirmed);
    if (profile.locationConfirmed) {
      profile.locationConfirmedAt = new Date();
    } else {
      profile.locationConfirmedAt = null;
    }
  }
  if (payload.locationSource !== undefined) {
    profile.locationSource = payload.locationSource || '';
  }
  if (payload.providerRefId !== undefined) {
    profile.providerRefId = payload.providerRefId || null;
  }

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
  applyAccountContact(profile, user);
  if (payload.weeklyHours !== undefined) {
    profile.weeklyHours = persistableWeeklyHours(parseWeeklyHours(payload.weeklyHours));
  }
  if (Array.isArray(payload.completedSteps)) {
    const steps = payload.completedSteps.map((flag) => flag === true);
    if (steps[4] === true) {
      const owner = await loadUser(userId);
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
  if (user?.role === 'CONTRACTOR' && Array.isArray(payload.completedSteps) && payload.completedSteps[2] === true) {
    const issue = firstProjectIssue(profile);
    if (issue) throw new ApiError(400, projectIssueMessage(issue));
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
    (user?.role === 'CONTRACTOR' || user?.role === 'MATERIAL_STORE_OWNER') &&
    profile.businessName &&
    profile.address &&
    profile.verificationStatus !== VERIFICATION_STATUS.APPROVED
  ) {
    const lockedType = user?.role === 'MATERIAL_STORE_OWNER' ? STORE_TYPE.MATERIALS : STORE_TYPE.SERVICES;
    await storeService.syncOwnerStore(userId, lockedType, {
      name: profile.businessName,
      address: profile.address,
      city: profile.city,
      description: profile.description,
    });
  }
  if (payload.weeklyHours !== undefined) {
    await syncStoreHoursSummary(userId, profile.weeklyHours);
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
  if (type === DOCUMENT_TYPE.STORE_IMAGE && (file.size > 8 * 1024 * 1024 || !IMAGE_MIME.has(mime))) {
    throw new ApiError(400, 'The file format or size is not valid.');
  }
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

function ekycKindFromUrl(url) {
  const value = String(url || '');
  if (!value.startsWith('private:ekyc:')) return null;
  return value.slice('private:ekyc:'.length);
}

async function openDocumentFile(userId, documentId, actor) {
  const profile = await ensureContractorProfile(userId);
  const ownerId = String(profile.userId || userId);
  assertCanReadVerificationDoc({
    role: actor?.role,
    userId: actor?.id || actor?.userId,
    ownerId,
  });
  const doc = profile.documents.find((item) => String(item._id) === String(documentId));
  if (!doc) throw new ApiError(404, 'Document not found');
  const ekycKind = ekycKindFromUrl(doc.url);
  if (ekycKind) {
    const contractorEkycService = require('./contractorEkycService');
    return contractorEkycService.openForOwner(ownerId, ekycKind);
  }
  return verificationStorage.openFromUrl(doc.url, doc.mimeType);
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

function reopenIfRejected(profile) {
  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }
}

function ensureProjects(profile) {
  if (!profile.portfolio) profile.portfolio = emptyPortfolio();
  if (!Array.isArray(profile.portfolio.projects)) profile.portfolio.projects = [];
}

function findProject(profile, projectId) {
  const list = profile.portfolio?.projects;
  if (!list) return null;
  if (typeof list.id === 'function') return list.id(projectId);
  return list.find((item) => String(item._id) === String(projectId)) || null;
}

async function createPortfolioProject(userId) {
  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  ensureProjects(profile);
  if (profile.portfolio.projects.length >= MAX_PROJECTS) {
    throw new ApiError(400, projectIssueMessage('limit'));
  }
  profile.portfolio.projects.push({
    serviceId: '',
    serviceNameSnapshot: '',
    description: '',
    images: [],
  });
  profile.markModified('portfolio');
  reopenIfRejected(profile);
  await profile.save();
  return profile.toPublic();
}

async function updatePortfolioProject(userId, projectId, payload) {
  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  ensureProjects(profile);
  const project = findProject(profile, projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  if (payload.serviceId !== undefined) {
    const serviceId = String(payload.serviceId || '').trim();
    if (!serviceId) {
      project.serviceId = '';
      project.serviceNameSnapshot = '';
    } else {
      const match = findRegisteredService(profile.services, serviceId);
      if (!match) throw new ApiError(400, projectIssueMessage('service'));
      project.serviceId = registeredServiceId(match);
      project.serviceNameSnapshot = match.name || '';
    }
  }
  if (payload.description !== undefined) {
    project.description = String(payload.description || '').trim().slice(0, 500);
  }
  profile.markModified('portfolio');
  reopenIfRejected(profile);
  await profile.save();
  return profile.toPublic();
}

async function deletePortfolioProject(userId, projectId) {
  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  ensureProjects(profile);
  const project = findProject(profile, projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  profile.portfolio.projects.pull(project._id);
  profile.markModified('portfolio');
  reopenIfRejected(profile);
  await profile.save();
  return profile.toPublic();
}

async function addProjectImage(userId, projectId, file) {
  if (!file?.url) throw new ApiError(400, 'Choose a file to upload');
  if (file.size > 8 * 1024 * 1024) throw new ApiError(400, projectIssueMessage('size'));
  const mime = resolvedMime(file);
  if (!imageAllowed(mime)) throw new ApiError(400, projectIssueMessage('type'));

  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  ensureProjects(profile);
  const project = findProject(profile, projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  const images = (project.images || []).filter(Boolean);
  if (images.length >= MAX_PROJECT_IMAGES) throw new ApiError(400, projectIssueMessage('count'));
  project.images = [...images, file.url];
  profile.markModified('portfolio');
  reopenIfRejected(profile);
  await profile.save();
  return profile.toPublic();
}

async function removeProjectImage(userId, projectId, url) {
  const profile = await ensureContractorProfile(userId);
  assertVerificationEditable(profile);
  ensureProjects(profile);
  const project = findProject(profile, projectId);
  if (!project) throw new ApiError(404, 'Project not found');
  project.images = (project.images || []).filter((item) => item !== url);
  profile.markModified('portfolio');
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

function hasValidRegistrationLocation(profile) {
  const lat = profile.lat !== undefined && profile.lat !== null ? profile.lat : profile.latitude;
  const lng = profile.lng !== undefined && profile.lng !== null ? profile.lng : profile.longitude;
  if (lat == null || lng == null) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || Number.isNaN(numLat) || numLat < -90 || numLat > 90) return false;
  if (!Number.isFinite(numLng) || Number.isNaN(numLng) || numLng < -180 || numLng > 180) return false;
  if (numLat === 0 && numLng === 0) return false;
  if (!profile.locationConfirmed) return false;
  return true;
}

function applicationReady(profile, role) {
  if (!profile.businessName || profile.businessName.trim().length < 2) return false;
  if (!profile.address || profile.address.trim().length < 4) return false;
  if (!profile.city || profile.city.trim().length < 2) return false;
  if (!hasValidRegistrationLocation(profile)) return false;
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
      && Boolean(profile.portfolio?.workshop)
      && !firstProjectIssue(profile);
  }
  const categories = profile.materialCategories?.length ? profile.materialCategories : profile.serviceAreas;
  return (profile.description || '').trim().length >= 10
    && (categories || []).length >= 1
    && hasDocument(profile, new Set(['STORE_IMAGE', 'PORTFOLIO']));
}

async function identitySubmitted(userId) {
  const { postgres } = require('../repositories/partnerAccess');
  if (!postgres) {
    const { ContractorEkycVerification } = require('../models/ContractorEkycVerification');
    const ekyc = await ContractorEkycVerification.findOne({ userId }).select('status');
    return ekyc?.status === EKYC_STATUS.SUBMITTED;
  }
  const { prisma } = require('../config/prisma');
  const owner = await prisma.users.findFirst({
    where: { legacy_mongo_id: String(userId) },
    select: { id: true },
  });
  if (!owner) return false;
  const row = await prisma.contractor_ekyc_verifications.findUnique({ where: { user_id: owner.id } });
  return row?.status === EKYC_STATUS.SUBMITTED;
}

async function submitVerification(userId, payload) {
  if (payload?.acceptedTerms !== true) {
    throw new ApiError(400, 'You must accept the Terms of Service');
  }

  const profile = await ensureContractorProfile(userId);
  const user = await loadUser(userId);
  if (user?.role === 'CONTRACTOR') {
    profile.services = await catalogService.resolveProfileServices(profile.services, profile.services, userId);
    profile.markModified('services');
    await catalogService.syncCustomStatuses(profile);
    const serviceReason = servicesBlockReason(profile.services);
    if (serviceReason) throw new ApiError(400, serviceReason);
    const projectIssue = firstProjectIssue(profile);
    if (projectIssue) throw new ApiError(400, projectIssueMessage(projectIssue));
  }
  if (user?.role === 'MATERIAL_STORE_OWNER') {
    const source = profile.materialCategories?.length ? profile.materialCategories : profile.serviceAreas;
    const resolved = await materialCategoryService.resolveForOwner(userId, source || []);
    profile.materialCategories = resolved;
    profile.serviceAreas = resolved.map((item) => item.name);
    profile.markModified('materialCategories');
    profile.markModified('serviceAreas');
  }

  if (!hasValidRegistrationLocation(profile)) {
    throw new ApiError(400, 'A valid confirmed location is required before submitting your application');
  }

  if (!applicationReady(profile, user?.role)) {
    throw new ApiError(400, 'Complete every onboarding step before submitting');
  }

  if (user?.role === 'CONTRACTOR' || user?.role === 'MATERIAL_STORE_OWNER') {
    const submitted = await identitySubmitted(userId);
    if (!submitted) {
      throw new ApiError(400, 'Complete identity verification before submitting');
    }
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

  await updateUser(userId, {
    status: USER_STATUS.PENDING_VERIFICATION,
    profileStatus: PROFILE_STATUS.SUBMITTED,
  });
  return profile.toPublic();
}

async function getMaterialWorkspace(userId) {
  const [profile, store] = await Promise.all([
    ensureContractorProfile(userId),
    Store.findOne({ contractorId: userId }),
  ]);
  const activationService = require('./activation.service');
  const activation = await activationService.getActivationReadiness(userId, { profile, store });
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
  const actor = await loadUser(userId);
  const storeOwner = actor?.role === 'MATERIAL_STORE_OWNER' || actor?.role === 'STORE';
  await writeAudit({
    actorId: userId,
    actorRole: storeOwner ? 'MATERIAL_STORE_OWNER' : 'CONTRACTOR',
    action: AUDIT_ACTION.PROFILE_UPDATE,
    entityType: 'ContractorProfile',
    entityId: profile._id,
    meta: { kind: 'verification-change-request', note: text },
  });
  const admins = await findUsersByRole('ADMIN');
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
  const store = await Store.findOne({ contractorId: userId });
  const services = store ? await Service.countDocuments({ storeId: store._id }) : 0;
  const activationService = require('./activation.service');
  const activation = await activationService.getActivationReadiness(userId, { profile, store });

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
  openDocumentFile,
  addPortfolioFile,
  removePortfolioFile,
  createPortfolioProject,
  updatePortfolioProject,
  deletePortfolioProject,
  addProjectImage,
  removeProjectImage,
  submitVerification,
  requestVerificationChange,
  getWorkspace,
  getMaterialWorkspace,
};
