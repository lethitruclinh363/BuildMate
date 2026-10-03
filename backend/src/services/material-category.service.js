const { MaterialCategory, CATEGORY_RECORD_STATUS } = require('../models/MaterialCategory');
const { Store } = require('../models/Store');
const { ContractorProfile } = require('../models/ContractorProfile');
const { ApiError } = require('../utils/ApiError');
const { insertUnique, foldServiceName } = require('../constants/contractor-services');
const {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  CATEGORY_MESSAGES,
  systemCategoryPick,
  publicCustomCategory,
  classifyMaterialCategory,
  resolveMaterialSelection,
  categoriesFromLegacyAreas,
  findSystemCategory,
} = require('../constants/material-categories');

function throwCategoryError(result) {
  const status = result.code === 'DUPLICATE_SYSTEM_CATEGORY' || result.code === 'DUPLICATE_CUSTOM_CATEGORY' ? 409 : 400;
  throw new ApiError(status, result.error || CATEGORY_MESSAGES.INVALID, {
    code: result.code || 'INVALID',
    category: result.category || null,
  });
}

async function ownedCategories(userId) {
  return MaterialCategory.find({ ownerId: userId, type: { $ne: 'SYSTEM' }, status: { $ne: CATEGORY_RECORD_STATUS.REJECTED } });
}

async function systemCategories() {
  return MaterialCategory.find({ type: 'SYSTEM', status: { $ne: CATEGORY_RECORD_STATUS.REJECTED } });
}

function systemPickFromDoc(doc) {
  return {
    name: doc.name,
    type: 'SYSTEM',
    categoryId: String(doc._id),
    status: 'APPROVED',
    aliases: [doc.name],
    createdAt: doc.createdAt || null,
  };
}

async function listForOwner(userId) {
  const [custom, extras] = await Promise.all([ownedCategories(userId), systemCategories()]);
  return {
    system: [...MATERIAL_CATEGORIES.map((name) => systemCategoryPick(name)), ...extras.map(systemPickFromDoc)],
    custom: custom.map((doc) => publicCustomCategory(doc)),
  };
}

async function checkCategory(userId, name) {
  const [owned, extras] = await Promise.all([ownedCategories(userId), systemCategories()]);
  return classifyMaterialCategory(name, owned, extras);
}

async function createCustomCategory({ name, userId }) {
  const [owned, extras] = await Promise.all([ownedCategories(userId), systemCategories()]);
  const classified = classifyMaterialCategory(name, owned, extras);
  if (classified.code === 'INVALID') {
    throw new ApiError(400, CATEGORY_MESSAGES.EMPTY, { code: 'INVALID', category: null });
  }
  if (classified.code === 'DUPLICATE_SYSTEM_CATEGORY') {
    throw new ApiError(409, CATEGORY_MESSAGES.SYSTEM, {
      code: 'DUPLICATE_SYSTEM_CATEGORY',
      category: classified.category,
    });
  }
  if (classified.code === 'DUPLICATE_CUSTOM_CATEGORY') {
    throw new ApiError(409, CATEGORY_MESSAGES.CUSTOM, {
      code: 'DUPLICATE_CUSTOM_CATEGORY',
      category: classified.category,
    });
  }
  if (findSystemCategory(classified.displayName, extras)) {
    throw new ApiError(409, CATEGORY_MESSAGES.SYSTEM, { code: 'DUPLICATE_SYSTEM_CATEGORY', category: null });
  }

  const store = await Store.findOne({ contractorId: userId }).select('_id');
  const payload = {
    name: classified.displayName,
    normalizedName: classified.normalizedName,
    foldedName: classified.foldedName,
    type: 'CUSTOM',
    status: CATEGORY_RECORD_STATUS.APPROVED,
    ownerId: userId,
    storeId: store?._id || null,
  };
  const result = await insertUnique(payload, {
    create: (doc) => MaterialCategory.create(doc),
    find: () =>
      MaterialCategory.findOne({
        ownerId: userId,
        $or: [{ normalizedName: payload.normalizedName }, { foldedName: payload.foldedName }],
      }),
  });
  if (!result.created) {
    throw new ApiError(409, CATEGORY_MESSAGES.CUSTOM, {
      code: 'DUPLICATE_CUSTOM_CATEGORY',
      category: publicCustomCategory(result.doc),
    });
  }
  return publicCustomCategory(result.doc);
}

async function registerStoreCategory(userId, name) {
  const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
  const profile = await ContractorProfile.findOne({ userId });
  if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(403, 'This partner is not verified yet');
  }
  const [owned, extras] = await Promise.all([ownedCategories(userId), systemCategories()]);
  const current = selectionFromProfile(profile, owned, extras);
  if (current.length >= 12) {
    throw new ApiError(400, CATEGORY_MESSAGES.INVALID, { code: 'INVALID' });
  }
  const classified = classifyMaterialCategory(name, owned, extras);
  if (classified.code === 'INVALID') {
    throw new ApiError(400, CATEGORY_MESSAGES.EMPTY, { code: 'INVALID' });
  }
  const folded = classified.foldedName || foldServiceName(classified.displayName);
  const alreadyListed = current.some((item) => foldServiceName(item.name) === folded);
  if (
    alreadyListed ||
    classified.code === 'DUPLICATE_SYSTEM_CATEGORY' ||
    classified.code === 'DUPLICATE_CUSTOM_CATEGORY'
  ) {
    throw new ApiError(409, 'This category already exists.', {
      code: classified.code === 'DUPLICATE_SYSTEM_CATEGORY' ? 'DUPLICATE_SYSTEM_CATEGORY' : 'DUPLICATE_CUSTOM_CATEGORY',
    });
  }
  const created = await createCustomCategory({ name: classified.displayName, userId });
  const next = [
    ...current.map((item) => ({
      name: item.name,
      type: item.type,
      categoryId: item.categoryId || null,
      status: item.status || 'APPROVED',
    })),
    {
      name: created.name,
      type: 'CUSTOM',
      categoryId: created.categoryId,
      status: created.status || 'APPROVED',
    },
  ];
  const resolved = await resolveForOwner(userId, next);
  profile.materialCategories = resolved;
  profile.markModified('materialCategories');
  await profile.save();
  return categoriesForProfile(profile);
}

async function resolveForOwner(userId, items) {
  const [owned, extras] = await Promise.all([ownedCategories(userId), systemCategories()]);
  const result = resolveMaterialSelection(items, owned, extras);
  if (result.error) throwCategoryError(result);
  return result.items;
}

async function canonicalCategoryForOwner(ownerId, raw) {
  const extras = await systemCategories();
  const system = findSystemCategory(raw, extras);
  if (system) return system;
  const folded = foldServiceName(raw);
  if (!folded) throw new ApiError(400, CATEGORY_MESSAGES.EMPTY, { code: 'INVALID' });
  const custom = await MaterialCategory.findOne({
    ownerId,
    foldedName: folded,
    type: { $ne: 'SYSTEM' },
    status: { $ne: CATEGORY_RECORD_STATUS.REJECTED },
  });
  if (!custom) throw new ApiError(400, CATEGORY_MESSAGES.INVALID, { code: 'INVALID' });
  return custom.name;
}

function ownedDocFor(item, owned) {
  const id = item.categoryId ? String(item.categoryId) : '';
  return (
    owned.find((doc) => id && String(doc._id) === id) ||
    owned.find((doc) => foldServiceName(doc.name) === foldServiceName(item.name)) ||
    null
  );
}

function presentSelection(items, owned, extras) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.name)
    .map((item) => {
      const type = item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM';
      const ownedDoc = type === 'CUSTOM' ? ownedDocFor(item, owned) : null;
      const systemName = type === 'SYSTEM' ? findSystemCategory(item.name, extras) || item.name : ownedDoc?.name || item.name;
      const systemDoc =
        type === 'SYSTEM'
          ? extras.find((doc) => doc._id && foldServiceName(doc.name) === foldServiceName(systemName))
          : null;
      return {
        name: systemName,
        type,
        categoryId: type === 'CUSTOM' ? item.categoryId || (ownedDoc ? String(ownedDoc._id) : null) : systemDoc ? String(systemDoc._id) : null,
        status: item.status || ownedDoc?.status || 'APPROVED',
        createdAt: (ownedDoc || systemDoc)?.createdAt || null,
      };
    });
}

function selectionFromProfile(profile, owned, extras) {
  const stored = Array.isArray(profile.materialCategories) ? profile.materialCategories : [];
  if (stored.length) {
    const resolved = resolveMaterialSelection(stored, owned, extras);
    return presentSelection(resolved.error ? stored : resolved.items, owned, extras);
  }
  return presentSelection(categoriesFromLegacyAreas(profile.serviceAreas, owned, extras), owned, extras);
}

async function categoriesForProfile(profile) {
  if (!profile) return [];
  const ownerId = profile.userId?._id || profile.userId;
  const [owned, extras] = await Promise.all([
    ownerId ? MaterialCategory.find({ ownerId, type: { $ne: 'SYSTEM' } }) : [],
    systemCategories(),
  ]);
  return selectionFromProfile(profile, owned, extras);
}

async function selectionsForProfiles(profiles) {
  const stores = profiles.filter((profile) => profile.userId?.role === 'MATERIAL_STORE_OWNER');
  const ownerIds = stores.map((profile) => profile.userId?._id || profile.userId).filter(Boolean);
  const [owned, extras] = await Promise.all([
    ownerIds.length
      ? MaterialCategory.find({ ownerId: { $in: ownerIds }, type: { $ne: 'SYSTEM' } })
      : [],
    systemCategories(),
  ]);
  const byOwner = new Map();
  for (const doc of owned) {
    const key = String(doc.ownerId);
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push(doc);
  }
  const byProfile = new Map();
  for (const profile of stores) {
    const ownerId = String(profile.userId?._id || profile.userId || '');
    byProfile.set(String(profile._id), selectionFromProfile(profile, byOwner.get(ownerId) || [], extras));
  }
  return byProfile;
}

function builtinAdminRow(name) {
  return {
    id: null,
    name,
    labels: {
      vi: MATERIAL_CATEGORY_LABELS.vi[name] || name,
      en: MATERIAL_CATEGORY_LABELS.en[name] || name,
    },
    group: 'Materials',
    type: 'SYSTEM',
    status: 'ACTIVE',
    createdAt: null,
    locked: true,
    storeName: null,
    ownerId: null,
  };
}

function systemAdminRow(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    labels: { vi: doc.name, en: doc.name },
    group: 'Materials',
    type: 'SYSTEM',
    status: doc.status || 'APPROVED',
    createdAt: doc.createdAt || null,
    locked: false,
    storeName: null,
    ownerId: null,
  };
}

async function listForAdmin() {
  const [extras, customs] = await Promise.all([
    MaterialCategory.find({ type: 'SYSTEM' }).sort({ createdAt: -1 }),
    MaterialCategory.find({ type: { $ne: 'SYSTEM' } }).sort({ createdAt: -1 }),
  ]);
  const ownerIds = customs.map((doc) => doc.ownerId).filter(Boolean);
  const profiles = ownerIds.length
    ? await ContractorProfile.find({ userId: { $in: ownerIds } }).select('userId businessName')
    : [];
  const storeName = new Map(profiles.map((profile) => [String(profile.userId), profile.businessName || '']));
  return {
    system: [...MATERIAL_CATEGORIES.map(builtinAdminRow), ...extras.map(systemAdminRow)],
    custom: customs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      labels: { vi: doc.name, en: doc.name },
      group: 'Materials',
      type: 'CUSTOM',
      status: doc.status || 'APPROVED',
      createdAt: doc.createdAt || null,
      locked: true,
      storeName: storeName.get(String(doc.ownerId)) || null,
      ownerId: doc.ownerId ? String(doc.ownerId) : null,
    })),
  };
}

async function assertCreatableSystemName(name, ignoreId) {
  const extras = (await systemCategories()).filter((doc) => !ignoreId || String(doc._id) !== String(ignoreId));
  const classified = classifyMaterialCategory(name, [], extras);
  if (classified.code === 'INVALID') {
    throw new ApiError(400, CATEGORY_MESSAGES.EMPTY, { code: 'INVALID', category: null });
  }
  if (classified.code === 'DUPLICATE_SYSTEM_CATEGORY') {
    throw new ApiError(409, CATEGORY_MESSAGES.SYSTEM, {
      code: 'DUPLICATE_SYSTEM_CATEGORY',
      category: classified.category,
    });
  }
  const clashFilter = {
    foldedName: classified.foldedName,
    status: { $ne: CATEGORY_RECORD_STATUS.REJECTED },
  };
  if (ignoreId) clashFilter._id = { $ne: ignoreId };
  const clash = await MaterialCategory.findOne(clashFilter);
  if (clash) {
    throw new ApiError(409, CATEGORY_MESSAGES.SYSTEM, {
      code: 'DUPLICATE_SYSTEM_CATEGORY',
      category: clash.type === 'SYSTEM' ? systemPickFromDoc(clash) : publicCustomCategory(clash),
    });
  }
  return classified;
}

async function createAdminSystemCategory({ name }) {
  const classified = await assertCreatableSystemName(name);
  const payload = {
    name: classified.displayName,
    normalizedName: classified.normalizedName,
    foldedName: classified.foldedName,
    type: 'SYSTEM',
    status: CATEGORY_RECORD_STATUS.APPROVED,
    ownerId: null,
    storeId: null,
  };
  const result = await insertUnique(payload, {
    create: (doc) => MaterialCategory.create(doc),
    find: () => MaterialCategory.findOne({ type: 'SYSTEM', foldedName: payload.foldedName }),
  });
  if (!result.created) {
    throw new ApiError(409, CATEGORY_MESSAGES.SYSTEM, {
      code: 'DUPLICATE_SYSTEM_CATEGORY',
      category: systemPickFromDoc(result.doc),
    });
  }
  return systemAdminRow(result.doc);
}

async function updateAdminSystemCategory(id, { name }) {
  const doc = await MaterialCategory.findOne({ _id: id, type: 'SYSTEM' });
  if (!doc) throw new ApiError(404, 'Category not found');
  const classified = await assertCreatableSystemName(name, doc._id);
  doc.name = classified.displayName;
  doc.normalizedName = classified.normalizedName;
  doc.foldedName = classified.foldedName;
  await doc.save();
  return systemAdminRow(doc);
}

module.exports = {
  listForOwner,
  checkCategory,
  createCustomCategory,
  registerStoreCategory,
  resolveForOwner,
  canonicalCategoryForOwner,
  categoriesForProfile,
  selectionsForProfiles,
  selectionFromProfile,
  listForAdmin,
  createAdminSystemCategory,
  updateAdminSystemCategory,
};
