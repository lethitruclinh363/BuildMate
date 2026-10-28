const fs = require('fs');
const { VERIFICATION_STATUS, DOCUMENT_TYPE } = require('../models/ContractorProfile');
const { ContractorProfile } = require('../repositories/partnerAccess');
const { ContractorEkycVerification } = require('../repositories/ekycAccess');
const { ApiError } = require('../utils/ApiError');
const { env } = require('../config/env');
const { ekycAiClient } = require('./ekycAiClient');
const {
  EKYC_STATUS,
  resolveAiStatus,
  canSubmitEkyc,
  emptyOcr,
  toPublic,
  archiveAttempt,
} = require('./ekycStatus');
const {
  assertEkycImage,
  saveEkycImage,
  readPrivate,
  resolvePrivate,
  contentTypeFor,
} = require('./ekycStorage');
const { notify } = require('./notificationService');
const { NOTIFICATION_TYPE } = require('../models/Notification');
const { setProfileStatus, PROFILE_STATUS } = require('./profileStatusService');

const FILE_KINDS = {
  front: (record) => record.cardImages?.front,
  back: (record) => record.cardImages?.back,
  center: (record) => record.liveness?.centerImage,
  left: (record) => record.liveness?.leftImage,
  right: (record) => record.liveness?.rightImage,
  up: (record) => record.liveness?.upImage,
  down: (record) => record.liveness?.downImage,
};

function assertEditable(profile) {
  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Profile is locked while under review');
  }
  if (profile.verificationStatus === VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(409, 'Verified details can only change through a new review');
  }
}

function imageFromUpload(file) {
  const mime = assertEkycImage(file, env.maxFileSizeMb * 1024 * 1024);
  return { buffer: file.buffer, mime };
}

async function ensureRecord(userId, contractorId) {
  let record = await ContractorEkycVerification.findOne({ userId });
  if (record) return record;
  const year = new Date().getFullYear();
  const count = await ContractorEkycVerification.countDocuments();
  record = await ContractorEkycVerification.create({
    userId,
    contractorId,
    referenceCode: `BM-EKYC-${year}-${String(count + 1).padStart(5, '0')}`,
    status: EKYC_STATUS.NOT_STARTED,
    ocr: emptyOcr(),
  });
  return record;
}

function resetAiFields(record) {
  record.ocr = emptyOcr();
  record.liveness = { passed: false, centerImage: '', leftImage: '', rightImage: '', upImage: '', downImage: '' };
  record.faceMatch = undefined;
  record.faceTemplate = undefined;
  record.set('faceTemplate', undefined);
  record.submittedAt = null;
  record.processedAt = null;
  record.markModified('ocr');
  record.markModified('liveness');
  record.markModified('faceMatch');
}

async function getForUser(userId) {
  const record = await ContractorEkycVerification.findOne({ userId }).select('-faceTemplate');
  return record ? record.toPublic() : toPublic({ userId, status: EKYC_STATUS.NOT_STARTED });
}

async function publicByUserIds(userIds) {
  const rows = await ContractorEkycVerification.find({ userId: { $in: userIds } }).select('-faceTemplate');
  const map = new Map();
  for (const row of rows) map.set(String(row.userId), row.toPublic());
  return map;
}

async function saveCard(userId, profile, type, file) {
  assertEditable(profile);
  if (type !== DOCUMENT_TYPE.CCCD_FRONT && type !== DOCUMENT_TYPE.CCCD_BACK) {
    throw new ApiError(400, 'Invalid document type');
  }
  const image = imageFromUpload(file);
  const kind = type === DOCUMENT_TYPE.CCCD_FRONT ? 'front' : 'back';
  const relative = saveEkycImage(userId, kind, image.buffer, image.mime);
  const record = await ensureRecord(userId, profile._id);
  if (!record.cardImages) record.cardImages = {};
  record.cardImages[kind] = relative;
  record.status = EKYC_STATUS.IN_PROGRESS;
  resetAiFields(record);
  record.markModified('cardImages');
  await record.save();

  profile.documents = (profile.documents || []).filter((doc) => doc.type !== type);
  profile.documents.push({
    type,
    url: `private:ekyc:${kind}`,
    originalName: file.originalname || `${kind}.jpg`,
    mimeType: image.mime,
    size: file.size || image.buffer.length,
  });
  profile.markModified('documents');
  if (profile.verificationStatus === VERIFICATION_STATUS.REJECTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = '';
  }
  await profile.save();
  const saved = profile.documents.find((doc) => doc.type === type);
  if (kind === 'front') record.frontDocumentId = saved?._id || null;
  else record.backDocumentId = saved?._id || null;
  await record.save();
  return record.toPublic();
}

async function checkReadiness(userId, profile, file) {
  assertEditable(profile);
  const image = imageFromUpload(file);
  return ekycAiClient.checkReadiness(image);
}

async function validateFrame(userId, profile, files, step) {
  assertEditable(profile);
  const allowed = new Set(['center', 'left', 'right', 'up', 'down']);
  const pose = String(step || '').trim().toLowerCase();
  if (!allowed.has(pose)) throw new ApiError(400, 'Invalid liveness step');
  const frame = imageFromUpload(files.frame);
  const reference = files.reference ? imageFromUpload(files.reference) : null;
  const opposite = files.opposite ? imageFromUpload(files.opposite) : null;
  return ekycAiClient.validateFrame({ frame, step: pose, reference, opposite });
}

function storedImage(relativePath) {
  const file = readPrivate(relativePath);
  return { buffer: file.buffer, mime: file.mime };
}

async function markFailed(record, patch) {
  record.status = EKYC_STATUS.AI_FAILED;
  record.processedAt = new Date();
  Object.assign(record, patch);
  await record.save();
  return record.toPublic();
}

async function processVerification(userId, profile, files) {
  assertEditable(profile);
  const record = await ensureRecord(userId, profile._id);
  if (record.status === EKYC_STATUS.SUBMITTED) {
    throw new ApiError(409, 'Identity verification is already submitted');
  }
  if (!record.cardImages?.front || !record.cardImages?.back) {
    throw new ApiError(400, 'Upload both sides of the ID card first');
  }

  const selfie = imageFromUpload(files.selfie);
  const left = imageFromUpload(files.left);
  const right = imageFromUpload(files.right);
  const up = imageFromUpload(files.up);
  const down = imageFromUpload(files.down);

  record.status = EKYC_STATUS.AI_CHECKING;
  record.faceMatch = undefined;
  record.faceTemplate = undefined;
  await record.save();

  const poses = { center: selfie, left, right, up, down };
  const savedPaths = {};
  for (const [kind, image] of Object.entries(poses)) {
    savedPaths[kind] = saveEkycImage(userId, kind, image.buffer, image.mime);
  }

  let ocr;
  try {
    ocr = await ekycAiClient.verifyEkycUpload(
      storedImage(record.cardImages.front),
      storedImage(record.cardImages.back)
    );
  } catch (err) {
    if (err.statusCode >= 500) {
      record.status = EKYC_STATUS.IN_PROGRESS;
      await record.save();
      throw err;
    }
    record.ocr = { ...emptyOcr(), issues: [err.message || 'OCR failed'] };
    record.liveness = {
      passed: false,
      centerImage: savedPaths.center,
      leftImage: savedPaths.left,
      rightImage: savedPaths.right,
      upImage: savedPaths.up,
      downImage: savedPaths.down,
    };
    record.markModified('ocr');
    record.markModified('liveness');
    return markFailed(record);
  }

  let enroll;
  try {
    enroll = await ekycAiClient.enroll({ selfie, left, right, up, down });
  } catch (err) {
    record.ocr = {
      idNumber: ocr.id_card_number || '',
      fullName: ocr.full_name || '',
      dateOfBirth: ocr.date_of_birth || '',
      gender: ocr.gender || '',
      hometown: ocr.hometown || '',
      passed: Boolean(ocr.validation_passed),
      issues: ocr.validation_errors || [],
    };
    record.liveness = {
      passed: false,
      centerImage: savedPaths.center,
      leftImage: savedPaths.left,
      rightImage: savedPaths.right,
      upImage: savedPaths.up,
      downImage: savedPaths.down,
    };
    record.markModified('ocr');
    record.markModified('liveness');
    if (err.statusCode >= 500) {
      record.status = EKYC_STATUS.IN_PROGRESS;
      await record.save();
      throw err;
    }
    return markFailed(record);
  }

  let match;
  try {
    match = await ekycAiClient.matchIdPortrait(storedImage(record.cardImages.front), selfie);
  } catch (err) {
    if (err.statusCode >= 500) {
      record.status = EKYC_STATUS.IN_PROGRESS;
      await record.save();
      throw err;
    }
    record.ocr = {
      idNumber: ocr.id_card_number || '',
      fullName: ocr.full_name || '',
      dateOfBirth: ocr.date_of_birth || '',
      gender: ocr.gender || '',
      hometown: ocr.hometown || '',
      passed: Boolean(ocr.validation_passed && ocr.id_card_number && ocr.full_name),
      issues: Array.isArray(ocr.validation_errors) ? ocr.validation_errors : [err.message || 'Face match failed'],
    };
    record.liveness = {
      passed: Boolean(enroll?.enrolled && enroll?.liveness_passed),
      centerImage: savedPaths.center,
      leftImage: savedPaths.left,
      rightImage: savedPaths.right,
      upImage: savedPaths.up,
      downImage: savedPaths.down,
    };
    record.markModified('ocr');
    record.markModified('liveness');
    return markFailed(record);
  }

  const ocrPassed = Boolean(ocr.validation_passed && ocr.id_card_number && ocr.full_name && ocr.date_of_birth);
  const livenessPassed = Boolean(enroll?.enrolled && enroll?.liveness_passed && enroll?.active_liveness_passed);
  const status = resolveAiStatus({
    ocrPassed,
    livenessPassed,
    faceDecision: match?.decision,
  });

  record.ocr = {
    idNumber: ocr.id_card_number || '',
    fullName: ocr.full_name || '',
    dateOfBirth: ocr.date_of_birth || '',
    gender: ocr.gender || '',
    hometown: ocr.hometown || '',
    passed: ocrPassed,
    issues: Array.isArray(ocr.validation_errors) ? ocr.validation_errors : [],
  };
  record.liveness = {
    passed: livenessPassed,
    centerImage: savedPaths.center,
    leftImage: savedPaths.left,
    rightImage: savedPaths.right,
    upImage: savedPaths.up,
    downImage: savedPaths.down,
  };
  record.faceMatch = {
    decision: match.decision,
    matched: Boolean(match.matched),
    distance: match.distance,
    threshold: match.threshold,
  };
  record.faceTemplate = Array.isArray(enroll.embedding) ? enroll.embedding : undefined;
  record.status = status;
  record.processedAt = new Date();
  record.markModified('ocr');
  record.markModified('liveness');
  record.markModified('faceMatch');
  await record.save();

  console.info(`[ekyc] processed status=${status} decision=${match.decision || ''}`);
  return record.toPublic();
}

async function submit(userId, profile) {
  assertEditable(profile);
  const record = await ContractorEkycVerification.findOne({ userId }).select('-faceTemplate');
  if (!record || !canSubmitEkyc(record.status)) {
    throw new ApiError(400, 'Identity checks must pass before submission');
  }
  if (!record.cardImages?.front || !record.cardImages?.back || !record.liveness?.passed || !record.faceMatch?.decision) {
    throw new ApiError(400, 'Identity checks must pass before submission');
  }
  record.status = EKYC_STATUS.SUBMITTED;
  record.submittedAt = new Date();
  await record.save();
  return record.toPublic();
}

function openFile(record, kind) {
  const pick = FILE_KINDS[kind];
  if (!pick) throw new ApiError(400, 'Unknown verification image');
  const relative = pick(record);
  if (!relative) throw new ApiError(404, 'Verification image not found');
  const full = resolvePrivate(relative);
  if (!fs.existsSync(full)) throw new ApiError(404, 'Verification image not found');
  return { full, contentType: contentTypeFor(relative) };
}

async function openForOwner(userId, kind) {
  const record = await ContractorEkycVerification.findOne({ userId }).select('-faceTemplate');
  if (!record) throw new ApiError(404, 'Verification image not found');
  return openFile(record, kind);
}

async function openForAdmin(profileId, kind) {
  const profile = await ContractorProfile.findById(profileId).select('userId');
  if (!profile) throw new ApiError(404, 'Partner application not found');
  const record = await ContractorEkycVerification.findOne({ userId: profile.userId }).select('-faceTemplate');
  if (!record) throw new ApiError(404, 'Verification image not found');
  return openFile(record, kind);
}

async function requestRetake(profileId, adminId, reason) {
  const profile = await ContractorProfile.findById(profileId);
  if (!profile) throw new ApiError(404, 'Partner application not found');
  const record = await ContractorEkycVerification.findOne({ userId: profile.userId });
  if (!record) throw new ApiError(404, 'eKYC record not found');
  const note = String(reason || '').trim();
  if (note.length < 8) throw new ApiError(400, 'Provide a clear rejection reason');

  record.attempts.push(archiveAttempt(record));
  record.status = EKYC_STATUS.NOT_STARTED;
  record.retakeReason = note;
  record.adminReview = {
    reviewedBy: adminId,
    reviewedAt: new Date(),
    decision: 'REQUEST_RETAKE',
    note,
  };
  resetAiFields(record);
  await record.save();

  if (profile.verificationStatus === VERIFICATION_STATUS.SUBMITTED) {
    profile.verificationStatus = VERIFICATION_STATUS.DRAFT;
    profile.rejectionReason = note;
    await profile.save();
    await setProfileStatus(profile.userId, PROFILE_STATUS.DRAFT);
  }

  await notify({
    userId: profile.userId,
    title: 'Yêu cầu xác minh lại',
    message: note.slice(0, 400),
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: '/partner/onboarding',
    meta: { ekycStatus: EKYC_STATUS.NOT_STARTED },
  });
  return record.toPublic();
}

async function recordAdminDecision(userId, adminId, decision, note = '') {
  const record = await ContractorEkycVerification.findOne({ userId });
  if (!record) return null;
  record.adminReview = {
    reviewedBy: adminId,
    reviewedAt: new Date(),
    decision,
    note,
  };
  await record.save();
  return record.toPublic();
}

module.exports = {
  getForUser,
  publicByUserIds,
  saveCard,
  checkReadiness,
  validateFrame,
  processVerification,
  submit,
  openForOwner,
  openForAdmin,
  requestRetake,
  recordAdminDecision,
};
