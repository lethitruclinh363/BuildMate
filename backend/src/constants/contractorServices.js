const CONTRACTOR_SERVICE_CATEGORIES = Object.freeze([
  'Electrical',
  'Plumbing',
  'Painting',
  'Tiling',
  'Interior',
  'Repair',
  'Construction',
]);

const CONTRACTOR_SERVICES = Object.freeze([
  { category: 'Electrical', name: 'Wiring' },
  { category: 'Electrical', name: 'Lighting' },
  { category: 'Electrical', name: 'Outlet and switch' },
  { category: 'Electrical', name: 'Ceiling fan' },
  { category: 'Plumbing', name: 'Pipe leak' },
  { category: 'Plumbing', name: 'Faucet' },
  { category: 'Plumbing', name: 'Drain cleaning' },
  { category: 'Plumbing', name: 'Toilet installation' },
  { category: 'Painting', name: 'Interior painting' },
  { category: 'Painting', name: 'Exterior painting' },
  { category: 'Painting', name: 'Ceiling paint' },
  { category: 'Tiling', name: 'Floor tiling' },
  { category: 'Tiling', name: 'Wall tiling' },
  { category: 'Tiling', name: 'Bathroom tiling' },
  { category: 'Interior', name: 'Cabinet' },
  { category: 'Interior', name: 'Drywall' },
  { category: 'Interior', name: 'Door installation' },
  { category: 'Repair', name: 'Home repair' },
  { category: 'Repair', name: 'Roof leak' },
  { category: 'Repair', name: 'Window repair' },
  { category: 'Construction', name: 'House extension' },
  { category: 'Construction', name: 'Wall construction' },
  { category: 'Construction', name: 'Renovation' },
]);

const SERVICE_LABELS = Object.freeze({
  vi: {
    Wiring: 'Đi dây điện',
    Lighting: 'Lắp đèn',
    'Outlet and switch': 'Ổ cắm và công tắc',
    'Ceiling fan': 'Quạt trần',
    'Pipe leak': 'Rò rỉ ống nước',
    Faucet: 'Vòi nước',
    'Drain cleaning': 'Thông tắc',
    'Toilet installation': 'Lắp bồn cầu',
    'Interior painting': 'Sơn trong nhà',
    'Exterior painting': 'Sơn ngoài nhà',
    'Ceiling paint': 'Sơn trần',
    'Floor tiling': 'Ốp lát sàn',
    'Wall tiling': 'Ốp lát tường',
    'Bathroom tiling': 'Ốp lát nhà vệ sinh',
    Cabinet: 'Tủ',
    Drywall: 'Thạch cao',
    'Door installation': 'Lắp cửa',
    'Home repair': 'Sửa chữa nhà',
    'Roof leak': 'Dột mái',
    'Window repair': 'Sửa cửa sổ',
    'House extension': 'Cơi nới',
    'Wall construction': 'Xây tường',
    Renovation: 'Cải tạo',
  },
  en: {
    Wiring: 'Wiring',
    Lighting: 'Lighting',
    'Outlet and switch': 'Outlet and switch',
    'Ceiling fan': 'Ceiling fan',
    'Pipe leak': 'Pipe leak',
    Faucet: 'Faucet',
    'Drain cleaning': 'Drain cleaning',
    'Toilet installation': 'Toilet installation',
    'Interior painting': 'Interior painting',
    'Exterior painting': 'Exterior painting',
    'Ceiling paint': 'Ceiling paint',
    'Floor tiling': 'Floor tiling',
    'Wall tiling': 'Wall tiling',
    'Bathroom tiling': 'Bathroom tiling',
    Cabinet: 'Cabinet',
    Drywall: 'Drywall',
    'Door installation': 'Door installation',
    'Home repair': 'Home repair',
    'Roof leak': 'Roof leak',
    'Window repair': 'Window repair',
    'House extension': 'House extension',
    'Wall construction': 'Wall construction',
    Renovation: 'Renovation',
  },
});

const CATEGORY_SET = new Set(CONTRACTOR_SERVICE_CATEGORIES);

function collapseServiceName(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

function normalizeServiceName(value) {
  return collapseServiceName(value).toLocaleLowerCase('vi');
}

function foldServiceName(value) { 
  return normalizeServiceName(value)
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function serviceAliases(item) {
  return [item.name, SERVICE_LABELS.vi[item.name], SERVICE_LABELS.en[item.name]].filter(Boolean);
}

function findSystemService(value) {
  const normalized = normalizeServiceName(value);
  if (!normalized) return null;
  return CONTRACTOR_SERVICES.find((item) => serviceAliases(item).some((label) => normalizeServiceName(label) === normalized)) || null;
}

function isSystemService(category, name) {
  return CONTRACTOR_SERVICES.some((item) => item.category === category && item.name === name);
}

function systemPick(item) {
  return {
    category: item.category,
    name: item.name,
    type: 'SYSTEM',
    serviceId: `${item.category}::${item.name}`,
    status: 'APPROVED',
  };
}

function normalizedAliases(name) {
  const system = findSystemService(name);
  const labels = system ? serviceAliases(system) : [name];
  return new Set(labels.map((label) => normalizeServiceName(label)).filter(Boolean));
}

function offeringIdentity(item) {
  if (!item) return null;
  if (item.type === 'CUSTOM') {
    if ((item.status !== 'APPROVED' && item.status !== 'ACTIVE') || !item.serviceId) return null;
    const name = collapseServiceName(item.name);
    if (!name) return null;
    return {
      catalogKey: String(item.serviceId),
      catalogType: 'CUSTOM',
      name,
      category: item.category,
    };
  }
  const system = findSystemService(item.name);
  if (system) {
    return {
      catalogKey: `${system.category}::${system.name}`,
      catalogType: 'SYSTEM',
      name: system.name,
      category: system.category,
    };
  }
  if (!item.serviceId) return null;
  const name = collapseServiceName(item.name);
  if (!name) return null;
  return {
    catalogKey: String(item.serviceId),
    catalogType: 'SYSTEM',
    name,
    category: item.category,
  };
}

function matchesCatalogName(storedName, identity) {
  if (!identity) return false;
  return normalizedAliases(identity.name).has(normalizeServiceName(storedName));
}

function publicPricedServiceMatch() {
  return {
    isActive: true,
    basePrice: { $gt: 0 },
    completionStatus: { $ne: 'INCOMPLETE' },
  };
}

function isCategory(value) {
  return CATEGORY_SET.has(value);
}

function servicesBlockReason(items) {
  const list = items || [];
  if (!list.length) return 'Select a valid service';
  const seen = new Set();
  for (const item of list) {
    const normalized = normalizeServiceName(item?.name);
    if (!normalized || collapseServiceName(item?.name).length > 80) return 'Enter a service name';
    if (item?.type === 'CUSTOM') {
      if (findSystemService(normalized)) return 'This service already exists in the BuildMate catalog.';
      if (item.status === 'REJECTED') return 'This service cannot be registered.';
      const key = `custom:${normalized}`;
      if (seen.has(key)) return 'This service is already added.';
      seen.add(key);
      const category = String(item.category || '');
      if (category && category !== 'Custom' && !isCategory(category)) return 'Choose a service category.';
      if (isCategory(category) && !item.serviceId) return 'Select a valid service';
      continue;
    }
    const system = findSystemService(normalized);
    if (system) {
      if (system.category !== item.category || system.name !== item.name) return 'Select a valid service';
      if (seen.has(systemPick(system).serviceId) || seen.has(`custom:${normalized}`)) return 'This service is already added.';
      seen.add(systemPick(system).serviceId);
      seen.add(`custom:${normalizeServiceName(system.name)}`);
      for (const label of serviceAliases(system)) seen.add(`custom:${normalizeServiceName(label)}`);
      continue;
    }
    if (!item.serviceId || !isCategory(item.category)) return 'Select a valid service';
    if (seen.has(String(item.serviceId))) return 'This service is already added.';
    seen.add(String(item.serviceId));
  }
  return '';
}

function visibleOnboardingServices(items) {
  return (items || []).filter(
    (item) => item?.type !== 'CUSTOM' || item?.status === 'APPROVED' || item?.status === 'ACTIVE'
  );
}

function normalizeContractorServices(items) {
  const seen = new Set();
  const next = [];
  for (const raw of items || []) {
    const name = collapseServiceName(raw?.name);
    const type = raw?.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM';
    if (!name || name.length > 80) continue;
    if (type === 'CUSTOM') {
      if (findSystemService(name)) continue;
      const key = `custom:${normalizeServiceName(name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({
        category: raw.category || 'Custom',
        name,
        type: 'CUSTOM',
        serviceId: raw.serviceId || null,
        status: raw.status || 'PENDING_APPROVAL',
      });
      continue;
    }
    const system = findSystemService(name);
    const category = String(raw?.category || '').trim();
    const canonical = system && system.category === category ? system : isSystemService(category, name) ? { category, name } : null;
    if (!canonical) continue;
    const pick = systemPick(canonical.name ? { category: canonical.category, name: canonical.name } : canonical);
    if (seen.has(pick.serviceId)) continue;
    seen.add(pick.serviceId);
    next.push(pick);
  }
  return next.slice(0, 40);
}

async function insertUnique(payload, { create, find }) {
  try {
    const doc = await create(payload);
    return { created: true, doc };
  } catch (err) {
    if (err && err.code === 11000) {
      const doc = await find(payload.normalizedName);
      if (!doc) throw err;
      return { created: false, doc };
    }
    throw err;
  }
}

module.exports = {
  CONTRACTOR_SERVICE_CATEGORIES,
  CONTRACTOR_SERVICES,
  SERVICE_LABELS,
  collapseServiceName,
  normalizeServiceName,
  foldServiceName,
  findSystemService,
  serviceAliases,
  isSystemService,
  isCategory,
  systemPick,
  offeringIdentity,
  matchesCatalogName,
  normalizedAliases,
  publicPricedServiceMatch,
  servicesBlockReason,
  visibleOnboardingServices,
  normalizeContractorServices,
  insertUnique,
};
