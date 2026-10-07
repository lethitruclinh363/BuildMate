const crypto = require('crypto');
const { db } = require('./pgContext');
const { toPublic, emptyOcr } = require('../services/ekycStatus');

const DIRECTIONS = {
  center: 'CENTER',
  left: 'LEFT',
  right: 'RIGHT',
  up: 'UP',
  down: 'DOWN',
};

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function legacyOf(value) {
  if (value == null || value === '') return '';
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function num(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function decision(value) {
  return value ? String(value) : null;
}

function framesOf(liveness) {
  return Object.entries(DIRECTIONS)
    .map(([key, direction]) => ({ direction, file_url: liveness?.[`${key}Image`] || '' }))
    .filter((frame) => frame.file_url);
}

function livenessFromFrames(passed, frames) {
  const liveness = { passed: Boolean(passed), centerImage: '', leftImage: '', rightImage: '', upImage: '', downImage: '' };
  for (const frame of frames || []) {
    const key = Object.keys(DIRECTIONS).find((name) => DIRECTIONS[name] === frame.direction);
    if (key) liveness[`${key}Image`] = frame.file_url;
  }
  return liveness;
}

const include = {
  contractor_profiles: { select: { legacy_mongo_id: true } },
  users_contractor_ekyc_verifications_user_idTousers: { select: { legacy_mongo_id: true } },
  users_contractor_ekyc_verifications_admin_reviewed_byTousers: { select: { legacy_mongo_id: true } },
  ekyc_ocr_issues: { orderBy: { sort_order: 'asc' } },
  ekyc_liveness_frames: true,
  ekyc_attempts: {
    include: {
      ekyc_attempt_ocr_issues: { orderBy: { sort_order: 'asc' } },
      ekyc_attempt_liveness_frames: true,
      users: { select: { legacy_mongo_id: true } },
    },
    orderBy: { archived_at: 'asc' },
  },
};

class PgEkyc {
  constructor(data) {
    Object.assign(this, data);
    this.ocr = data.ocr || emptyOcr();
    this.liveness = data.liveness || { passed: false, centerImage: '', leftImage: '', rightImage: '', upImage: '', downImage: '' };
    this.cardImages = data.cardImages || { front: '', back: '' };
    this.attempts = [...(data.attempts || [])];
    this.adminReview = data.adminReview || null;
    this.faceMatch = data.faceMatch || null;
  }

  toObject() {
    return {
      _id: this._id,
      id: this._id,
      contractorId: this.contractorId,
      userId: this.userId,
      referenceCode: this.referenceCode,
      status: this.status,
      frontDocumentId: this.frontDocumentId,
      backDocumentId: this.backDocumentId,
      cardImages: this.cardImages,
      ocr: this.ocr,
      liveness: this.liveness,
      faceMatch: this.faceMatch,
      faceTemplate: this.faceTemplate,
      submittedAt: this.submittedAt,
      processedAt: this.processedAt,
      retakeReason: this.retakeReason,
      adminReview: this.adminReview,
      attempts: this.attempts,
    };
  }

  toPublic() {
    return toPublic(this);
  }

  markModified() {}

  set(path, value) {
    if (typeof path === 'string') {
      this[path] = value;
      return this;
    }
    if (path && typeof path === 'object') Object.assign(this, path);
    return this;
  }

  async save() {
    await persistEkyc(this);
    return this;
  }
}

function attemptFromRow(row) {
  return {
    _id: row.legacy_mongo_sub_id || String(row.id),
    status: row.status || '',
    ocr: {
      idNumber: row.ocr_id_number || '',
      fullName: row.ocr_full_name || '',
      dateOfBirth: row.ocr_date_of_birth || '',
      gender: row.ocr_gender || '',
      hometown: row.ocr_hometown || '',
      passed: row.ocr_passed,
      issues: (row.ekyc_attempt_ocr_issues || []).map((issue) => issue.issue),
    },
    liveness: livenessFromFrames(row.liveness_passed, row.ekyc_attempt_liveness_frames),
    cardImages: { front: row.card_front_url || '', back: row.card_back_url || '' },
    faceMatch: row.face_decision ? {
      decision: row.face_decision,
      matched: row.face_matched,
      distance: num(row.face_distance),
      threshold: num(row.face_threshold),
    } : null,
    adminReview: row.admin_decision || row.admin_reviewed_at ? {
      reviewedBy: row.users?.legacy_mongo_id || null,
      reviewedAt: row.admin_reviewed_at,
      decision: row.admin_decision || '',
      note: row.admin_note || '',
    } : null,
    submittedAt: row.submitted_at,
    processedAt: row.processed_at,
    archivedAt: row.archived_at,
  };
}

function ekycFromRow(row) {
  return new PgEkyc({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    contractorId: row.contractor_profiles?.legacy_mongo_id || '',
    userId: row.users_contractor_ekyc_verifications_user_idTousers?.legacy_mongo_id || '',
    referenceCode: row.reference_code || '',
    status: row.status,
    frontDocumentId: row.legacy_front_document_id,
    backDocumentId: row.legacy_back_document_id,
    cardImages: { front: row.card_front_url || '', back: row.card_back_url || '' },
    ocr: {
      idNumber: row.ocr_id_number || '',
      fullName: row.ocr_full_name || '',
      dateOfBirth: row.ocr_date_of_birth || '',
      gender: row.ocr_gender || '',
      hometown: row.ocr_hometown || '',
      passed: row.ocr_passed,
      issues: (row.ekyc_ocr_issues || []).map((issue) => issue.issue),
    },
    liveness: livenessFromFrames(row.liveness_passed, row.ekyc_liveness_frames),
    faceMatch: row.face_decision ? {
      decision: row.face_decision,
      matched: row.face_matched,
      distance: num(row.face_distance),
      threshold: num(row.face_threshold),
    } : null,
    faceTemplate: row.face_template || undefined,
    submittedAt: row.submitted_at,
    processedAt: row.processed_at,
    retakeReason: row.retake_reason || '',
    adminReview: row.admin_reviewed_at || row.admin_decision ? {
      reviewedBy: row.users_contractor_ekyc_verifications_admin_reviewed_byTousers?.legacy_mongo_id || null,
      reviewedAt: row.admin_reviewed_at,
      decision: row.admin_decision || '',
      note: row.admin_note || '',
    } : null,
    attempts: (row.ekyc_attempts || []).map(attemptFromRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allEkyc() {
  return (await db().contractor_ekyc_verifications.findMany({ include })).map(ekycFromRow);
}

async function userPk(legacyId) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  const row = await db().users.findFirst({ where: { legacy_mongo_id: id }, select: { id: true } });
  return row?.id || null;
}

async function writeAttempt(verificationId, attempt) {
  const admin = attempt.adminReview?.reviewedBy ? await userPk(attempt.adminReview.reviewedBy) : null;
  const row = await db().ekyc_attempts.create({
    data: {
      legacy_mongo_sub_id: /^[0-9a-f]{24}$/i.test(String(attempt._id || '')) ? String(attempt._id) : null,
      ekyc_verification_id: verificationId,
      status: attempt.status || '',
      ocr_id_number: attempt.ocr?.idNumber || '',
      ocr_full_name: attempt.ocr?.fullName || '',
      ocr_date_of_birth: attempt.ocr?.dateOfBirth || '',
      ocr_gender: attempt.ocr?.gender || '',
      ocr_hometown: attempt.ocr?.hometown || '',
      ocr_passed: Boolean(attempt.ocr?.passed),
      liveness_passed: Boolean(attempt.liveness?.passed),
      card_front_url: attempt.cardImages?.front || '',
      card_back_url: attempt.cardImages?.back || '',
      face_decision: decision(attempt.faceMatch?.decision),
      face_matched: Boolean(attempt.faceMatch?.matched),
      face_distance: num(attempt.faceMatch?.distance),
      face_threshold: num(attempt.faceMatch?.threshold),
      admin_reviewed_by: admin,
      admin_reviewed_at: attempt.adminReview?.reviewedAt || null,
      admin_decision: attempt.adminReview?.decision || '',
      admin_note: attempt.adminReview?.note || '',
      submitted_at: attempt.submittedAt || null,
      processed_at: attempt.processedAt || null,
      archived_at: attempt.archivedAt || new Date(),
    },
  });
  const issues = attempt.ocr?.issues || [];
  for (let index = 0; index < issues.length; index += 1) {
    await db().ekyc_attempt_ocr_issues.create({
      data: { ekyc_attempt_id: row.id, issue: String(issues[index]), sort_order: index },
    });
  }
  for (const frame of framesOf(attempt.liveness)) {
    await db().ekyc_attempt_liveness_frames.create({
      data: { ekyc_attempt_id: row.id, direction: frame.direction, file_url: frame.file_url },
    });
  }
}

async function persistEkyc(doc) {
  const user = await userPk(doc.userId);
  const profile = await db().contractor_profiles.findFirst({
    where: { legacy_mongo_id: legacyOf(doc.contractorId) },
    select: { id: true },
  });
  if (!user || !profile) throw new Error('eKYC user or contractor profile is not in PostgreSQL');
  const admin = doc.adminReview?.reviewedBy ? await userPk(doc.adminReview.reviewedBy) : null;
  const template = doc.faceTemplate === undefined ? doc._keptTemplate : doc.faceTemplate;
  const data = {
    contractor_profile_id: profile.id,
    user_id: user,
    reference_code: String(doc.referenceCode || '').slice(0, 150),
    status: doc.status || 'NOT_STARTED',
    legacy_front_document_id: doc.frontDocumentId ? String(doc.frontDocumentId).slice(0, 24) : null,
    legacy_back_document_id: doc.backDocumentId ? String(doc.backDocumentId).slice(0, 24) : null,
    card_front_url: doc.cardImages?.front || '',
    card_back_url: doc.cardImages?.back || '',
    ocr_id_number: doc.ocr?.idNumber || '',
    ocr_full_name: doc.ocr?.fullName || '',
    ocr_date_of_birth: doc.ocr?.dateOfBirth || '',
    ocr_gender: doc.ocr?.gender || '',
    ocr_hometown: doc.ocr?.hometown || '',
    ocr_passed: Boolean(doc.ocr?.passed),
    liveness_passed: Boolean(doc.liveness?.passed),
    face_decision: decision(doc.faceMatch?.decision),
    face_matched: Boolean(doc.faceMatch?.matched),
    face_distance: num(doc.faceMatch?.distance),
    face_threshold: num(doc.faceMatch?.threshold),
    face_template: template || null,
    submitted_at: doc.submittedAt || null,
    processed_at: doc.processedAt || null,
    retake_reason: doc.retakeReason || '',
    admin_reviewed_by: admin,
    admin_reviewed_at: doc.adminReview?.reviewedAt || null,
    admin_decision: doc.adminReview?.decision || '',
    admin_note: doc.adminReview?.note || '',
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db().contractor_ekyc_verifications.update({ where: { id: doc.pgId }, data })
    : await db().contractor_ekyc_verifications.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  await db().ekyc_ocr_issues.deleteMany({ where: { ekyc_verification_id: row.id } });
  await db().ekyc_liveness_frames.deleteMany({ where: { ekyc_verification_id: row.id } });
  const issues = doc.ocr?.issues || [];
  for (let index = 0; index < issues.length; index += 1) {
    await db().ekyc_ocr_issues.create({
      data: { ekyc_verification_id: row.id, issue: String(issues[index]), sort_order: index },
    });
  }
  for (const frame of framesOf(doc.liveness)) {
    await db().ekyc_liveness_frames.create({
      data: { ekyc_verification_id: row.id, direction: frame.direction, file_url: frame.file_url },
    });
  }
  await db().ekyc_attempts.deleteMany({ where: { ekyc_verification_id: row.id } });
  for (const attempt of doc.attempts || []) await writeAttempt(row.id, attempt);
}

function hideTemplate(doc) {
  if (!doc) return doc;
  doc._keptTemplate = doc.faceTemplate;
  doc.faceTemplate = undefined;
  return doc;
}

function query(loader) {
  const state = { hide: false };
  const exec = async () => {
    const rows = await loader();
    return state.hide ? rows.map(hideTemplate) : rows;
  };
  const api = {
    select(spec) {
      state.hide = String(spec).includes('-faceTemplate');
      return api;
    },
    then(resolve, reject) {
      return exec().then(resolve, reject);
    },
  };
  return api;
}

const ContractorEkycVerification = {
  find(filter = {}) {
    return query(async () => {
      const rows = await allEkyc();
      return rows.filter((row) => {
        if (filter.userId?.$in) return filter.userId.$in.map((id) => legacyOf(id)).includes(legacyOf(row.userId));
        if (filter.userId) return legacyOf(row.userId) === legacyOf(filter.userId);
        return true;
      });
    });
  },
  findOne(filter = {}) {
    const many = this.find(filter);
    const api = {
      select(spec) {
        many.select(spec);
        return api;
      },
      then(resolve, reject) {
        return many.then((rows) => resolve(rows[0] || null), reject);
      },
    };
    return api;
  },
  async countDocuments() {
    return db().contractor_ekyc_verifications.count();
  },
  async create(data) {
    const doc = new PgEkyc({
      ...data,
      ocr: data.ocr || emptyOcr(),
      liveness: data.liveness || { passed: false },
      attempts: data.attempts || [],
    });
    await doc.save();
    return doc;
  },
};

module.exports = { ContractorEkycVerification };
