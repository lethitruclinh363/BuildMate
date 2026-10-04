const { collapseServiceName, normalizeServiceName, foldServiceName } = require('./contractor-services');

const MATERIAL_CATEGORIES = Object.freeze([
  'Cement',
  'Paint',
  'Pipe',
  'Tiles',
  'Steel',
  'Waterproof coat',
  'Tools',
  'Fixtures',
]);

const MATERIAL_CATEGORY_LABELS = Object.freeze({
  vi: {
    Cement: 'Xi măng',
    Paint: 'Sơn',
    Pipe: 'Ống',
    Tiles: 'Gạch',
    Steel: 'Thép',
    'Waterproof coat': 'Lớp chống thấm',
    Tools: 'Dụng cụ',
    Fixtures: 'Phụ kiện',
  },
  en: {
    Cement: 'Cement',
    Paint: 'Paint',
    Pipe: 'Pipe',
    Tiles: 'Tiles',
    Steel: 'Steel',
    'Waterproof coat': 'Waterproof coat',
    Tools: 'Tools',
    Fixtures: 'Fixtures',
  },
});

const CATEGORY_MESSAGES = Object.freeze({
  EMPTY: 'Please enter a category name.',
  SYSTEM: 'This category already exists in the system.',
  CUSTOM: 'This category has already been added.',
  INVALID: 'Select a valid category.',
});

const CATEGORY_SET = new Set(MATERIAL_CATEGORIES);

function categoryAliases(name) {
  return [name, MATERIAL_CATEGORY_LABELS.vi[name], MATERIAL_CATEGORY_LABELS.en[name]].filter(Boolean);
}

function extraCategoryNames(extras) {
  return (Array.isArray(extras) ? extras : [])
    .map((item) => collapseServiceName(typeof item === 'string' ? item : item?.name))
    .filter(Boolean);
}

function findSystemCategory(value, extras = []) {
  const normalized = normalizeServiceName(value);
  const folded = foldServiceName(value);
  if (!normalized) return null;
  const builtin =
    MATERIAL_CATEGORIES.find((name) =>
      categoryAliases(name).some((label) => normalizeServiceName(label) === normalized || foldServiceName(label) === folded)
    ) || null;
  if (builtin) return builtin;
  return extraCategoryNames(extras).find((name) => normalizeServiceName(name) === normalized || foldServiceName(name) === folded) || null;
}

function isSystemCategory(name) {
  return CATEGORY_SET.has(name);
}

function systemCategoryPick(name) {
  return {
    name,
    type: 'SYSTEM',
    categoryId: null,
    status: 'APPROVED',
    aliases: categoryAliases(name),
  };
}

function ownedIdentity(doc) {
  return {
    id: String(doc._id || doc.id || doc.categoryId || ''),
    name: collapseServiceName(doc.name),
    foldedName: doc.foldedName || foldServiceName(doc.name),
    status: doc.status || 'APPROVED',
    ownerId: doc.ownerId ? String(doc.ownerId) : null,
    storeId: doc.storeId ? String(doc.storeId) : null,
  };
}

function publicCustomCategory(doc) {
  const identity = ownedIdentity(doc);
  return {
    id: identity.id,
    name: identity.name,
    type: 'CUSTOM',
    categoryId: identity.id,
    status: identity.status,
    ownerId: identity.ownerId,
    storeId: identity.storeId,
  };
}

function classifyMaterialCategory(raw, owned = [], extras = []) {
  const displayName = collapseServiceName(raw);
  const normalizedName = normalizeServiceName(displayName);
  const foldedName = foldServiceName(displayName);
  if (!displayName || displayName.length > 80) {
    return { code: 'INVALID', normalizedName, foldedName, displayName, category: null };
  }
  const systemName = findSystemCategory(displayName, extras);
  if (systemName) {
    return {
      code: 'DUPLICATE_SYSTEM_CATEGORY',
      normalizedName,
      foldedName,
      displayName,
      category: systemCategoryPick(systemName),
    };
  }
  const ownedHit = owned
    .map(ownedIdentity)
    .find((item) => item.foldedName === foldedName || normalizeServiceName(item.name) === normalizedName);
  if (ownedHit) {
    return {
      code: 'DUPLICATE_CUSTOM_CATEGORY',
      normalizedName,
      foldedName,
      displayName,
      category: publicCustomCategory(ownedHit),
    };
  }
  return { code: 'AVAILABLE', normalizedName, foldedName, displayName, category: null };
}

function selectionFold(name) {
  return foldServiceName(name);
}

function categoriesFromLegacyAreas(areas, owned = [], extras = []) {
  const accepted = [];
  const seen = new Set();
  for (const area of Array.isArray(areas) ? areas : []) {
    const classified = classifyMaterialCategory(area, owned, extras);
    if (classified.code !== 'DUPLICATE_SYSTEM_CATEGORY' && classified.code !== 'DUPLICATE_CUSTOM_CATEGORY') continue;
    const system = classified.code === 'DUPLICATE_SYSTEM_CATEGORY';
    const pick = system
      ? { name: classified.category.name, type: 'SYSTEM', categoryId: null, status: 'APPROVED' }
      : {
          name: classified.category.name,
          type: 'CUSTOM',
          categoryId: classified.category.categoryId || null,
          status: classified.category.status || 'APPROVED',
        };
    const key = `${pick.type}:${foldServiceName(pick.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(pick);
  }
  return accepted;
}

function resolveMaterialSelection(items, owned = [], extras = []) {
  const seen = new Set();
  const next = [];
  const ownedRows = owned.map(ownedIdentity);
  for (const raw of Array.isArray(items) ? items : []) {
    const name = collapseServiceName(typeof raw === 'string' ? raw : raw?.name);
    if (!name || name.length > 80) {
      return { error: CATEGORY_MESSAGES.EMPTY, code: 'INVALID', items: [] };
    }
    const requestedType = typeof raw === 'string' ? '' : raw?.type === 'CUSTOM' ? 'CUSTOM' : raw?.type === 'SYSTEM' ? 'SYSTEM' : '';
    const systemName = findSystemCategory(name, extras);
    if (requestedType === 'CUSTOM' && systemName) {
      return { error: CATEGORY_MESSAGES.SYSTEM, code: 'DUPLICATE_SYSTEM_CATEGORY', items: [] };
    }
    if (systemName && requestedType !== 'CUSTOM') {
      const key = `system:${systemName}`;
      if (seen.has(key) || seen.has(`fold:${selectionFold(systemName)}`)) {
        return { error: CATEGORY_MESSAGES.CUSTOM, code: 'DUPLICATE_CUSTOM_CATEGORY', items: [] };
      }
      seen.add(key);
      for (const label of categoryAliases(systemName)) seen.add(`fold:${selectionFold(label)}`);
      next.push({
        name: systemName,
        type: 'SYSTEM',
        categoryId: null,
        status: 'APPROVED',
      });
      continue;
    }
    const folded = selectionFold(name);
    if (seen.has(`fold:${folded}`)) {
      return { error: CATEGORY_MESSAGES.CUSTOM, code: 'DUPLICATE_CUSTOM_CATEGORY', items: [] };
    }
    const ownedHit = ownedRows.find((item) => item.foldedName === folded && item.status !== 'REJECTED');
    if (!ownedHit) {
      return { error: CATEGORY_MESSAGES.INVALID, code: 'INVALID', items: [] };
    }
    const requestedId = typeof raw === 'string' ? '' : String(raw?.categoryId || '');
    if (requestedId && ownedHit.id && requestedId !== ownedHit.id) {
      return { error: CATEGORY_MESSAGES.INVALID, code: 'INVALID', items: [] };
    }
    seen.add(`fold:${folded}`);
    next.push({
      name: ownedHit.name,
      type: 'CUSTOM',
      categoryId: ownedHit.id,
      status: ownedHit.status || 'APPROVED',
    });
  }
  if (next.length > 12) {
    return { error: CATEGORY_MESSAGES.INVALID, code: 'INVALID', items: [] };
  }
  return { error: '', code: '', items: next };
}

module.exports = {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  CATEGORY_MESSAGES,
  categoryAliases,
  findSystemCategory,
  isSystemCategory,
  systemCategoryPick,
  publicCustomCategory,
  classifyMaterialCategory,
  resolveMaterialSelection,
  categoriesFromLegacyAreas,
};
