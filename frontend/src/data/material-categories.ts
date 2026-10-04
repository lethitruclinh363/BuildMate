export interface MaterialCategoryPick {
  name: string;
  type: 'SYSTEM' | 'CUSTOM';
  categoryId?: string | null;
  status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';
  aliases?: string[];
}

export interface MaterialCategoryCatalog {
  system: MaterialCategoryPick[];
  custom: MaterialCategoryPick[];
}

export function collapseCategoryName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function normalizeCategoryName(value: string) {
  return collapseCategoryName(value).toLocaleLowerCase('vi');
}

export function foldCategoryName(value: string) {
  return normalizeCategoryName(value)
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function materialCategoryKey(item: { name?: string }) {
  return foldCategoryName(item.name || '');
}

export function isMaterialCategoryPick(value: unknown): value is MaterialCategoryPick {
  if (!value || typeof value !== 'object') return false;
  const item = value as MaterialCategoryPick;
  const name = collapseCategoryName(item.name || '');
  return Boolean(name) && name.length <= 80 && (item.type === 'SYSTEM' || item.type === 'CUSTOM');
}

export function categoryDisplayLabel(item: { name: string; type?: string }, translate: (key: string) => string) {
  if (item.type === 'CUSTOM') return item.name;
  const hit = translate(`category.${item.name}`);
  if (!hit || hit === '—' || hit === `category.${item.name}`) return item.name;
  return hit;
}

export function findSystemCategoryMatch(value: string, system: MaterialCategoryPick[]) {
  const normalized = normalizeCategoryName(value);
  const folded = foldCategoryName(value);
  if (!normalized) return null;
  return (
    system.find((item) => {
      const labels = [item.name, ...(item.aliases || [])];
      return labels.some((label) => normalizeCategoryName(label) === normalized || foldCategoryName(label) === folded);
    }) || null
  );
}

export function findOwnedCategoryMatch(value: string, owned: MaterialCategoryPick[]) {
  const normalized = normalizeCategoryName(value);
  const folded = foldCategoryName(value);
  return (
    owned.find(
      (item) => item.type === 'CUSTOM' && (normalizeCategoryName(item.name) === normalized || foldCategoryName(item.name) === folded)
    ) || null
  );
}

export function mergeMaterialCategories(localItems: MaterialCategoryPick[], serverItems: MaterialCategoryPick[]) {
  return localItems.map((item) => {
    const match = serverItems.find((server) => {
      if (item.categoryId && server.categoryId && item.categoryId === server.categoryId) return true;
      if (item.type !== server.type) return false;
      return foldCategoryName(item.name) === foldCategoryName(server.name);
    });
    if (!match) return item;
    return {
      ...item,
      name: match.name || item.name,
      status: match.status || item.status,
      categoryId: item.categoryId || match.categoryId || null,
      type: match.type || item.type,
    };
  });
}

export function picksFromStoredNames(names: string[]): MaterialCategoryPick[] {
  return names
    .map((name) => collapseCategoryName(name))
    .filter((name) => name && name.length <= 80)
    .map((name) => ({
      name,
      type: 'SYSTEM' as const,
      categoryId: null,
      status: 'APPROVED' as const,
    }));
}
