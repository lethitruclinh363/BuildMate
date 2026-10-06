export const CONTRACTOR_SERVICE_CATEGORIES = [
  'Electrical',
  'Plumbing',
  'Painting',
  'Tiling',
  'Interior',
  'Repair',
  'Construction',
] as const;

export type ContractorServiceCategory = (typeof CONTRACTOR_SERVICE_CATEGORIES)[number];

export interface ContractorServicePick {
  category: ContractorServiceCategory | 'Custom';
  name: string;
  type?: 'SYSTEM' | 'CUSTOM';
  serviceId?: string | null;
  catalogKey?: string | null;
  label?: string;
  labelKey?: string;
  description?: string;
  status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
}

export interface ServiceNameCheck {
  code: 'AVAILABLE' | 'DUPLICATE_SYSTEM_SERVICE' | 'DUPLICATE_CUSTOM_SERVICE' | 'SIMILAR_SERVICE' | 'INVALID';
  normalizedName: string;
  displayName: string;
  service: ContractorServicePick | null;
  similar?: ContractorServicePick[];
}

export const CONTRACTOR_SERVICES: ContractorServicePick[] = [
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
];

export function collapseServiceName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function normalizeServiceName(value: string) {
  return collapseServiceName(value).toLocaleLowerCase('vi');
}

export function servicePickKey(item: { category?: string; name?: string; type?: string }) {
  if (item.type === 'CUSTOM') return `custom:${normalizeServiceName(item.name || '')}`;
  return `${item.category}::${item.name}`;
}

export function mergeServiceStatus(localItems: ContractorServicePick[], serverItems: ContractorServicePick[]) {
  return localItems.map((item) => {
    const match = serverItems.find((server) => {
      if (item.serviceId && server.serviceId && item.serviceId === server.serviceId) return true;
      if ((item.type === 'CUSTOM') !== (server.type === 'CUSTOM')) return false;
      if (item.type === 'CUSTOM') return normalizeServiceName(item.name) === normalizeServiceName(server.name);
      return item.category === server.category && item.name === server.name;
    });
    if (!match) return item;
    return {
      ...item,
      status: match.status || item.status,
      serviceId: item.serviceId || match.serviceId || null,
      category: item.type === 'CUSTOM' && match.category ? match.category : item.category,
      name: item.type === 'CUSTOM' && match.name ? match.name : item.name,
    };
  });
}

export function registeredServiceId(item: { serviceId?: string | null; category?: string; name?: string }) {
  if (item.serviceId) return item.serviceId;
  if (item.category && item.name) return `${item.category}::${item.name}`;
  return item.name || '';
}

export function catalogPickLabel(
  item: { name: string; label?: string; labelKey?: string; type?: string },
  translate: (key: string) => string
) {
  if (item.label) return item.label;
  if (item.labelKey) {
    const hit = translate(`serviceCatalog.${item.labelKey}`);
    if (hit && hit !== '—' && hit !== `serviceCatalog.${item.labelKey}`) return hit;
  }
  return catalogServiceLabel(item.name, translate);
}

export function catalogServiceLabel(name: string, translate: (key: string) => string) {
  const hit = translate(`serviceCatalog.${name}`);
  if (!hit || hit === '—' || hit === `serviceCatalog.${name}`) return name;
  return hit;
}

export function catalogCategoryLabel(category: string, translate: (key: string) => string) {
  const hit = translate(`category.${category}`);
  if (!hit || hit === '—' || hit === `category.${category}`) return category;
  return hit;
}

export function isContractorService(
  value: { category?: string; name?: string; type?: string; serviceId?: string | null } | null | undefined
): value is ContractorServicePick {
  const name = collapseServiceName(value?.name || '');
  if (!name || name.length > 80) return false;
  if (value?.type === 'CUSTOM' || value?.serviceId) return true;
  return CONTRACTOR_SERVICES.some((item) => item.category === value?.category && item.name === name);
}
