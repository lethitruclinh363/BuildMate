const { POLICY_STATUS, POLICY_TYPES } = require('../models/Policy');
const { Policy, PolicyRevision } = require('../repositories/systemAccess');
const { defaultPolicies } = require('./policyDefaults');
const { ApiError } = require('../utils/ApiError');
const { fromRequest } = require('./auditService');

const REGISTER_TYPES = [POLICY_TYPES.TERMS_OF_SERVICE, POLICY_TYPES.PRIVACY_POLICY];

function sanitizePolicyHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function present(doc, { includeContent = true } = {}) {
  if (!doc) return null;
  const row = {
    id: doc._id,
    title: doc.title,
    type: doc.type,
    language: doc.language,
    version: doc.version,
    status: doc.status,
    effectiveDate: doc.effectiveDate,
    createdBy: doc.createdBy || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  if (includeContent) row.content = doc.content;
  return row;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureDefaultPolicies() {
  const existing = await Policy.countDocuments();
  if (existing > 0) return;
  await Policy.insertMany(defaultPolicies());
  console.log('[policy] Seeded default policies');
}

async function deactivateSiblings(policy) {
  await Policy.updateMany(
    {
      _id: { $ne: policy._id },
      type: policy.type,
      language: policy.language,
      status: POLICY_STATUS.ACTIVE,
    },
    { $set: { status: POLICY_STATUS.INACTIVE } }
  );
}

async function snapshot(policy, editedBy) {
  await PolicyRevision.create({
    policyId: policy._id,
    title: policy.title,
    type: policy.type,
    content: policy.content,
    language: policy.language,
    version: policy.version,
    status: policy.status,
    effectiveDate: policy.effectiveDate,
    editedBy: editedBy || null,
  });
}

async function listPolicies({ search = '', type = '', status = '', language = '' } = {}) {
  const filter = {};
  if (type && Object.values(POLICY_TYPES).includes(type)) filter.type = type;
  if (status && Object.values(POLICY_STATUS).includes(status)) filter.status = status;
  if (language === 'vi' || language === 'en') filter.language = language;
  if (search.trim()) filter.title = { $regex: escapeRegex(search.trim()), $options: 'i' };
  const rows = await Policy.find(filter).sort({ updatedAt: -1 });
  return rows.map((row) => present(row, { includeContent: false }));
}

async function getPolicy(id) {
  const policy = await Policy.findById(id);
  if (!policy) throw new ApiError(404, 'Policy not found');
  return present(policy);
}

async function getActivePolicy(type, language) {
  if (!Object.values(POLICY_TYPES).includes(type)) {
    throw new ApiError(400, 'Unknown policy type');
  }
  const lang = language === 'en' ? 'en' : 'vi';
  const policy = await Policy.findOne({ type, language: lang, status: POLICY_STATUS.ACTIVE });
  if (!policy) throw new ApiError(404, 'Policy not found');
  return present(policy);
}

async function acceptanceForLanguage(language) {
  const lang = language === 'en' ? 'en' : 'vi';
  const active = await Policy.find({
    language: lang,
    status: POLICY_STATUS.ACTIVE,
    type: { $in: REGISTER_TYPES },
  });
  const terms = active.find((item) => item.type === POLICY_TYPES.TERMS_OF_SERVICE);
  const privacy = active.find((item) => item.type === POLICY_TYPES.PRIVACY_POLICY);
  if (!terms || !privacy) {
    throw new ApiError(400, 'Active policies are not available');
  }
  return {
    acceptanceVersion: `TERMS_OF_SERVICE:${terms.version};PRIVACY_POLICY:${privacy.version}`,
    termsVersion: terms.version,
    privacyVersion: privacy.version,
  };
}

async function createPolicy(payload, actor, req) {
  const status = payload.status || POLICY_STATUS.DRAFT;
  const policy = await Policy.create({
    title: payload.title.trim(),
    type: payload.type,
    content: sanitizePolicyHtml(payload.content),
    language: payload.language,
    version: payload.version.trim(),
    status,
    effectiveDate: payload.effectiveDate ? new Date(payload.effectiveDate) : new Date(),
    createdBy: actor?.id || null,
  });
  if (status === POLICY_STATUS.ACTIVE) await deactivateSiblings(policy);
  await fromRequest(req, {
    action: 'POLICY_UPDATED',
    entityType: 'Policy',
    entityId: policy._id,
    meta: { op: 'create', type: policy.type, version: policy.version },
  });
  return present(policy);
}

async function updatePolicy(id, payload, actor, req) {
  const policy = await Policy.findById(id);
  if (!policy) throw new ApiError(404, 'Policy not found');
  await snapshot(policy, actor?.id);
  if (payload.title !== undefined) policy.title = payload.title.trim();
  if (payload.type !== undefined) policy.type = payload.type;
  if (payload.content !== undefined) policy.content = sanitizePolicyHtml(payload.content);
  if (payload.language !== undefined) policy.language = payload.language;
  if (payload.version !== undefined) policy.version = payload.version.trim();
  if (payload.status !== undefined) policy.status = payload.status;
  if (payload.effectiveDate !== undefined) {
    policy.effectiveDate = payload.effectiveDate ? new Date(payload.effectiveDate) : null;
  }
  await policy.save();
  if (policy.status === POLICY_STATUS.ACTIVE) await deactivateSiblings(policy);
  await fromRequest(req, {
    action: 'POLICY_UPDATED',
    entityType: 'Policy',
    entityId: policy._id,
    meta: { op: 'update', type: policy.type, version: policy.version },
  });
  return present(policy);
}

async function history(id) {
  const policy = await Policy.findById(id);
  if (!policy) throw new ApiError(404, 'Policy not found');
  const rows = await PolicyRevision.find({ policyId: policy._id }).sort({ createdAt: -1 });
  return rows.map((row) => ({
    id: row._id,
    policyId: row.policyId,
    title: row.title,
    type: row.type,
    content: row.content,
    language: row.language,
    version: row.version,
    status: row.status,
    effectiveDate: row.effectiveDate,
    editedBy: row.editedBy,
    createdAt: row.createdAt,
  }));
}

module.exports = {
  ensureDefaultPolicies,
  listPolicies,
  getPolicy,
  getActivePolicy,
  acceptanceForLanguage,
  createPolicy,
  updatePolicy,
  history,
  sanitizePolicyHtml,
};
