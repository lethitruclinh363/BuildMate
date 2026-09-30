const { CatalogService, CATALOG_STATUS, LIVE_CATALOG_STATUSES } = require('../models/CatalogService');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ApiError } = require('../utils/ApiError');
const {
  CONTRACTOR_SERVICES,
  SERVICE_LABELS,
  collapseServiceName,
  normalizeServiceName,
  foldServiceName,
  findSystemService,
  isCategory,
  systemPick,
  serviceAliases,
  insertUnique,
} = require('../constants/contractor-services');

function publicCatalog(doc) {
  if (!doc) return null;
  if (typeof doc.toPublic === 'function') return doc.toPublic();
  const code = doc.code || '';
  return {
    id: String(doc._id || doc.id),
    name: doc.name,
    category: doc.category,
    description: doc.description || '',
    type: doc.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM',
    status: doc.status === CATALOG_STATUS.APPROVED ? CATALOG_STATUS.ACTIVE : doc.status,
    catalogKey: code || String(doc._id || doc.serviceId),
    serviceId: code || String(doc._id || doc.serviceId),
    labelKey: code.includes('::') ? code.split('::').pop() : '',
    proposedBy: doc.proposedBy || null,
  };
}

function isLive(status) {
  return LIVE_CATALOG_STATUSES.includes(status);
}

async function findCatalogDocument({ key = '', normalized = '', folded = '' } = {}) {
  const or = [];
  if (key && /^[a-f0-9]{24}$/i.test(key)) or.push({ _id: key });
  if (key) or.push({ code: key });
  if (normalized) or.push({ normalizedName: normalized });
  if (folded) or.push({ foldedName: folded });
  if (!or.length) return null;
  return CatalogService.findOne({ $or: or });
}

function systemByFold(folded) {
  if (!folded) return null;
  return (
    CONTRACTOR_SERVICES.find((item) => serviceAliases(item).some((label) => foldServiceName(label) === folded)) || null
  );
}

async function findSimilar(folded, excludeId) {
  if (!folded || folded.length < 4) return [];
  const rows = await CatalogService.find({ status: { $ne: CATALOG_STATUS.REJECTED } }).select('name foldedName category status code type');
  return rows
    .filter((row) => {
      if (excludeId && String(row._id) === String(excludeId)) return false;
      const other = row.foldedName || foldServiceName(row.name);
      if (!other || other === folded) return false;
      return other.includes(folded) || folded.includes(other);
    })
    .slice(0, 5)
    .map((row) => publicCatalog(row));
}

async function classifyName(raw, options = {}) {
  const displayName = collapseServiceName(raw);
  const normalizedName = normalizeServiceName(displayName);
  const folded = foldServiceName(displayName);
  if (!displayName || displayName.length > 80) {
    return { code: 'INVALID', normalizedName, displayName, service: null, similar: [] };
  }
  const system = findSystemService(normalizedName) || systemByFold(folded);
  let doc = await findCatalogDocument({
    key: system ? `${system.category}::${system.name}` : '',
    normalized: normalizedName,
    folded,
  });
  const editingSelf = Boolean(doc && options.excludeId && String(doc._id) === String(options.excludeId));
  const sameCanonical = Boolean(editingSelf && system && doc.code === `${system.category}::${system.name}`);
  if (editingSelf) doc = null;
  const match = doc || (!sameCanonical && system ? { ...systemPick(system), name: SERVICE_LABELS.vi[system.name] || system.name } : null);
  if (match) {
    const published = publicCatalog(doc) || systemPick(system);
    if (doc?.status === CATALOG_STATUS.REJECTED) {
      return { code: 'DUPLICATE_CUSTOM_SERVICE', normalizedName, displayName, service: published, similar: [] };
    }
    const customPending = doc && doc.status === CATALOG_STATUS.PENDING_APPROVAL;
    return {
      code: customPending ? 'DUPLICATE_CUSTOM_SERVICE' : 'DUPLICATE_SYSTEM_SERVICE',
      normalizedName,
      displayName,
      service: published,
      similar: [],
    };
  }
  const similar = await findSimilar(folded, options.excludeId);
  if (similar.length) {
    return { code: 'SIMILAR_SERVICE', normalizedName, displayName, service: similar[0], similar };
  }
  return { code: 'AVAILABLE', normalizedName, displayName, service: null, similar: [] };
}

function duplicateError(service) {
  if (service?.status === 'REJECTED') {
    return new ApiError(409, 'This service cannot be registered.', {
      code: 'DUPLICATE_CUSTOM_SERVICE',
      service,
    });
  }
  if (service?.type === 'SYSTEM' || service?.status === 'ACTIVE' || service?.status === 'APPROVED' || !service?.type) {
    return new ApiError(409, 'This service already exists in the BuildMate catalog.', {
      code: 'DUPLICATE_SYSTEM_SERVICE',
      service,
    });
  }
  return new ApiError(409, 'This custom service already exists.', {
    code: 'DUPLICATE_CUSTOM_SERVICE',
    service,
  });
}

function similarError(similar) {
  return new ApiError(409, 'This name is similar to an existing BuildMate service.', {
    code: 'SIMILAR_SERVICE',
    similar,
    service: similar?.[0] || null,
  });
}

async function createCustomService({ name, category, description, userId }) {
  const classified = await classifyName(name);
  if (classified.code === 'INVALID') throw new ApiError(400, 'Enter a service name');
  if (!isCategory(category)) throw new ApiError(400, 'Choose a service category.');
  if (classified.code === 'SIMILAR_SERVICE') throw similarError(classified.similar);
  if (classified.code !== 'AVAILABLE') throw duplicateError(classified.service);

  const result = await insertUnique(
    {
      name: classified.displayName,
      normalizedName: classified.normalizedName,
      foldedName: foldServiceName(classified.displayName),
      category,
      description: collapseServiceName(description || '').slice(0, 500),
      type: 'CUSTOM',
      status: CATALOG_STATUS.PENDING_APPROVAL,
      proposedBy: userId || null,
    },
    {
      create: (payload) => CatalogService.create(payload),
      find: (normalizedName) => CatalogService.findOne({ normalizedName }),
    }
  );
  if (!result.created) throw duplicateError(publicCatalog(result.doc));
  return publicCatalog(result.doc);
}

async function listActive() {
  await ensureSystemCatalog();
  const rows = await CatalogService.find({ status: { $in: LIVE_CATALOG_STATUSES } }).sort({ category: 1, name: 1 });
  return rows.map((row) => publicCatalog(row));
}

async function listApproved() {
  return listActive();
}

async function catalogStats() {
  const [total, active, inactive, proposals] = await Promise.all([
    CatalogService.countDocuments({ status: { $in: [...LIVE_CATALOG_STATUSES, CATALOG_STATUS.INACTIVE] } }),
    CatalogService.countDocuments({ status: { $in: LIVE_CATALOG_STATUSES } }),
    CatalogService.countDocuments({ status: CATALOG_STATUS.INACTIVE }),
    CatalogService.countDocuments({ status: CATALOG_STATUS.PENDING_APPROVAL }),
  ]);
  return { total, active, inactive, proposals };
}

async function listForAdmin({ q = '', category = '', status = '' } = {}) {
  await ensureSystemCatalog();
  const filter = { status: { $in: [...LIVE_CATALOG_STATUSES, CATALOG_STATUS.INACTIVE] } };
  if (status === 'ACTIVE') filter.status = { $in: LIVE_CATALOG_STATUSES };
  if (status === 'INACTIVE') filter.status = CATALOG_STATUS.INACTIVE;
  if (category && isCategory(category)) filter.category = category;
  const needle = collapseServiceName(q);
  if (needle) {
    filter.name = { $regex: needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  const [items, stats, proposals] = await Promise.all([
    CatalogService.find(filter).sort({ category: 1, name: 1 }),
    catalogStats(),
    CatalogService.find({ status: CATALOG_STATUS.PENDING_APPROVAL }).sort({ createdAt: -1 }).populate('proposedBy', 'name email'),
  ]);
  return {
    stats,
    items: items.map((row) => publicCatalog(row)),
    proposals: proposals.map((row) => ({
      ...publicCatalog(row),
      proposerName: row.proposedBy?.name || '',
      proposerEmail: row.proposedBy?.email || '',
    })),
  };
}

async function createCatalogService({ name, category, description, status, acknowledgeSimilar, adminId }) {
  if (!isCategory(category)) throw new ApiError(400, 'Choose a service category.');
  const classified = await classifyName(name);
  if (classified.code === 'INVALID') throw new ApiError(400, 'Enter a service name');
  if (classified.code === 'SIMILAR_SERVICE' && !acknowledgeSimilar) throw similarError(classified.similar);
  if (classified.code !== 'AVAILABLE' && classified.code !== 'SIMILAR_SERVICE') throw duplicateError(classified.service);
  const nextStatus = status === CATALOG_STATUS.INACTIVE ? CATALOG_STATUS.INACTIVE : CATALOG_STATUS.ACTIVE;
  const doc = await CatalogService.create({
    name: classified.displayName,
    normalizedName: classified.normalizedName,
    foldedName: foldServiceName(classified.displayName),
    category,
    description: collapseServiceName(description || '').slice(0, 500),
    type: 'SYSTEM',
    status: nextStatus,
    reviewedBy: adminId || null,
    reviewedAt: new Date(),
  });
  return publicCatalog(doc);
}

async function updateCatalogService(id, { name, category, description, status, acknowledgeSimilar }) {
  const doc = await CatalogService.findById(id);
  if (!doc) throw new ApiError(404, 'Select a valid service');
  if (doc.status === CATALOG_STATUS.PENDING_APPROVAL || doc.status === CATALOG_STATUS.REJECTED) {
    throw new ApiError(400, 'Select a valid service');
  }
  if (category && !isCategory(category)) throw new ApiError(400, 'Choose a service category.');
  if (name) {
    const classified = await classifyName(name, { excludeId: doc._id });
    if (classified.code === 'INVALID') throw new ApiError(400, 'Enter a service name');
    if (classified.code === 'SIMILAR_SERVICE' && !acknowledgeSimilar) throw similarError(classified.similar);
    if (classified.code !== 'AVAILABLE' && classified.code !== 'SIMILAR_SERVICE') throw duplicateError(classified.service);
    doc.name = classified.displayName;
    doc.normalizedName = classified.normalizedName;
    doc.foldedName = foldServiceName(classified.displayName);
  }
  if (category) doc.category = category;
  if (description !== undefined) doc.description = collapseServiceName(description).slice(0, 500);
  if (status === CATALOG_STATUS.ACTIVE || status === CATALOG_STATUS.INACTIVE) doc.status = status;
  await doc.save();
  return publicCatalog(doc);
}

async function setCatalogStatus(id, status) {
  if (status !== CATALOG_STATUS.ACTIVE && status !== CATALOG_STATUS.INACTIVE) {
    throw new ApiError(400, 'Select a valid service');
  }
  const doc = await CatalogService.findById(id);
  if (!doc || doc.status === CATALOG_STATUS.PENDING_APPROVAL || doc.status === CATALOG_STATUS.REJECTED) {
    throw new ApiError(404, 'Select a valid service');
  }
  doc.status = status;
  await doc.save();
  return publicCatalog(doc);
}

function catalogPick(row) {
  const code = row.code || '';
  return {
    category: row.category,
    name: code.includes('::') ? code.split('::').pop() : row.name,
    type: 'SYSTEM',
    serviceId: code || String(row._id),
    status: 'APPROVED',
  };
}

async function resolveProfileServices(items, currentServices = [], userId = null) {
  const seen = new Set();
  const next = [];
  for (const raw of items || []) {
    const displayName = collapseServiceName(raw?.name);
    if (!displayName || displayName.length > 80) throw new ApiError(400, 'Enter a service name');
    const normalized = normalizeServiceName(displayName);
    const folded = foldServiceName(displayName);
    const system = findSystemService(normalized) || systemByFold(folded);
    const requestedCustom = raw?.type === 'CUSTOM';
    if (system && requestedCustom) {
      throw new ApiError(400, 'This service already exists in the BuildMate catalog.', {
        code: 'DUPLICATE_SYSTEM_SERVICE',
        service: systemPick(system),
      });
    }
    if (!requestedCustom) {
      if (system) {
        const pick = systemPick(system);
        const row = await CatalogService.findOne({ code: pick.serviceId });
        if (row && !isLive(row.status)) {
          const already = (currentServices || []).some((entry) => entry?.serviceId === pick.serviceId || entry?.name === pick.name);
          if (!already) throw new ApiError(400, 'This service cannot be registered.');
        }
        if (seen.has(pick.serviceId)) continue;
        seen.add(pick.serviceId);
        seen.add(`custom:${normalizeServiceName(system.name)}`);
        next.push(pick);
        continue;
      }
      const row = await findCatalogDocument({ key: String(raw?.serviceId || ''), normalized, folded });
      if (!row) throw new ApiError(400, 'Select a valid service');
      if (!isLive(row.status)) {
        const already = (currentServices || []).some((entry) => String(entry?.serviceId || '') === String(row.code || row._id));
        if (!already) throw new ApiError(400, 'This service cannot be registered.');
      }
      const pick = catalogPick(row);
      if (seen.has(pick.serviceId)) continue;
      seen.add(pick.serviceId);
      next.push(pick);
      continue;
    }
    if (seen.has(`custom:${normalized}`)) continue;
    const category = String(raw?.category || '').trim();
    let doc = await findCatalogDocument({ normalized, folded });
    if (doc && (isLive(doc.status) || doc.type === 'SYSTEM')) {
      throw new ApiError(400, 'This service already exists in the BuildMate catalog.', {
        code: 'DUPLICATE_SYSTEM_SERVICE',
        service: publicCatalog(doc),
      });
    }
    if (!doc && !isCategory(category)) {
      const legacy = (currentServices || []).some(
        (row) => row?.type === 'CUSTOM' && normalizeServiceName(row.name) === normalized && !isCategory(row.category)
      );
      if (!legacy) throw new ApiError(400, 'Choose a service category.');
      seen.add(`custom:${normalized}`);
      next.push({
        category: category || 'Custom',
        name: displayName,
        type: 'CUSTOM',
        serviceId: raw.serviceId || null,
        status: raw.status === 'APPROVED' || raw.status === 'REJECTED' ? raw.status : 'PENDING_APPROVAL',
      });
      continue;
    }
    if (!doc) {
      const similar = await findSimilar(folded);
      if (similar.length) throw similarError(similar);
      const created = await insertUnique(
        {
          name: displayName,
          normalizedName: normalized,
          foldedName: folded,
          category,
          description: collapseServiceName(raw?.description || '').slice(0, 500),
          type: 'CUSTOM',
          status: CATALOG_STATUS.PENDING_APPROVAL,
          proposedBy: userId || null,
        },
        {
          create: (payload) => CatalogService.create(payload),
          find: (normalizedName) => CatalogService.findOne({ normalizedName }),
        }
      );
      doc = created.doc;
    }
    if (!doc) throw new ApiError(400, 'Select a valid service');
    if (doc.status === CATALOG_STATUS.REJECTED) {
      throw new ApiError(400, 'This service cannot be registered.', {
        code: 'DUPLICATE_CUSTOM_SERVICE',
        service: publicCatalog(doc),
      });
    }
    seen.add(`custom:${normalized}`);
    next.push({
      category: doc.category,
      name: doc.name,
      type: 'CUSTOM',
      serviceId: String(doc._id),
      status: doc.status === CATALOG_STATUS.ACTIVE ? 'APPROVED' : doc.status,
    });
    if (next.length >= 40) break;
  }
  return next.slice(0, 40);
}

async function syncCustomStatuses(profile) {
  const ids = (profile.services || [])
    .map((item) => item.serviceId)
    .filter((id) => /^[a-f0-9]{24}$/i.test(String(id || '')));
  if (!ids.length) return profile;
  const rows = await CatalogService.find({ _id: { $in: ids } });
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  let changed = false;
  for (const item of profile.services || []) {
    const row = byId.get(String(item.serviceId || ''));
    if (!row) continue;
    const official = row.type === 'SYSTEM' || isLive(row.status);
    const nextStatus = row.status === CATALOG_STATUS.REJECTED ? 'REJECTED' : official ? 'APPROVED' : 'PENDING_APPROVAL';
    const nextType = official ? 'SYSTEM' : 'CUSTOM';
    const nextName = row.code ? row.code.split('::').pop() : row.name;
    if (item.status !== nextStatus || item.name !== nextName || item.category !== row.category || item.type !== nextType) {
      item.status = nextStatus;
      item.name = nextName;
      item.category = row.category;
      item.type = nextType;
      changed = true;
    }
  }
  if (changed) {
    profile.markModified('services');
    await profile.save();
  }
  return profile;
}

async function materializeOfferings(serviceId) {
  const { Store, STORE_TYPE } = require('../models/Store');
  const serviceService = require('./service.service');
  const profiles = await ContractorProfile.find({
    verificationStatus: VERIFICATION_STATUS.APPROVED,
    'services.serviceId': String(serviceId),
  });
  for (const profile of profiles) {
    const store = await Store.findOne({ contractorId: profile.userId, storeType: STORE_TYPE.SERVICES });
    if (store) await serviceService.ensureContractorOfferings(store, profile);
  }
}

async function reviewCatalogService(id, status, adminId) {
  const approve = status === CATALOG_STATUS.APPROVED || status === CATALOG_STATUS.ACTIVE;
  const reject = status === CATALOG_STATUS.REJECTED;
  if (!approve && !reject) throw new ApiError(400, 'Select a valid service');
  const doc = await CatalogService.findById(id);
  if (!doc) throw new ApiError(404, 'Select a valid service');
  doc.status = approve ? CATALOG_STATUS.ACTIVE : CATALOG_STATUS.REJECTED;
  if (approve) doc.type = 'SYSTEM';
  doc.reviewedBy = adminId || null;
  doc.reviewedAt = new Date();
  await doc.save();
  const profileName = doc.code ? doc.code.split('::').pop() : doc.name;
  await ContractorProfile.updateMany(
    { 'services.serviceId': String(doc._id) },
    {
      $set: {
        'services.$[item].status': approve ? 'APPROVED' : 'REJECTED',
        'services.$[item].type': approve ? 'SYSTEM' : 'CUSTOM',
        'services.$[item].name': profileName,
        'services.$[item].category': doc.category,
      },
    },
    { arrayFilters: [{ 'item.serviceId': String(doc._id) }] }
  );
  if (approve) await materializeOfferings(doc._id);
  return publicCatalog(doc);
}

let seeded = false;
let seeding = null;

async function ensureSystemCatalog() {
  if (seeded) return;
  if (seeding) return seeding;
  seeding = (async () => {
    const unlabeled = await CatalogService.find({
      $or: [{ foldedName: '' }, { foldedName: null }, { foldedName: { $exists: false } }],
    });
    for (const doc of unlabeled) {
      doc.foldedName = foldServiceName(doc.name);
      await doc.save();
    }
    for (const item of CONTRACTOR_SERVICES) {
      const label = SERVICE_LABELS.vi[item.name] || item.name;
      const code = `${item.category}::${item.name}`;
      const normalizedName = normalizeServiceName(label);
      const foldedName = foldServiceName(label);
      const aliasSet = new Set(serviceAliases(item).map((alias) => normalizeServiceName(alias)));
      const existing = await CatalogService.findOne({ $or: [{ code }, { normalizedName }] });
      if (existing && (aliasSet.has(existing.normalizedName) || existing.code === code || existing.normalizedName === normalizedName)) {
        if (!existing.code) existing.code = code;
        existing.foldedName = foldedName;
        if (!existing.name) existing.name = label;
        if (existing.status === CATALOG_STATUS.APPROVED) existing.status = CATALOG_STATUS.ACTIVE;
        if (existing.status === CATALOG_STATUS.PENDING_APPROVAL && existing.normalizedName === normalizedName) {
          existing.type = 'SYSTEM';
          existing.status = CATALOG_STATUS.ACTIVE;
          existing.code = code;
          existing.name = label;
        } else if (isLive(existing.status) && existing.type !== 'SYSTEM') {
          existing.type = 'SYSTEM';
        }
        await existing.save();
        continue;
      }
      try {
        await CatalogService.create({
          name: label,
          normalizedName,
          foldedName,
          code,
          category: item.category,
          description: '',
          type: 'SYSTEM',
          status: CATALOG_STATUS.ACTIVE,
        });
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }
  })().then(() => {
    seeded = true;
  }).finally(() => {
    seeding = null;
  });
  return seeding;
}

module.exports = {
  classifyName,
  createCustomService,
  listApproved,
  listActive,
  listForAdmin,
  catalogStats,
  createCatalogService,
  updateCatalogService,
  setCatalogStatus,
  resolveProfileServices,
  syncCustomStatuses,
  reviewCatalogService,
  ensureSystemCatalog,
};
