export function dashBlank(value?: string | number | null) {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function normalizeMrlUnit(value?: string | null) {
  const unit = String(value || '').trim();
  const matched = unit.match(/^(\d+(?:[.,]\d+)?)\s+([^\d\s].*)$/);
  if (!matched) return unit;
  return matched[2].trim();
}

export function unitLooksLikeQuantity(value?: string | null) {
  return /^\d+(?:[.,]\d+)?\s+[^\d\s]/.test(String(value || '').trim());
}

export function formatMrlQuantity(value?: string | number | null) {
  if (value == null || value === '') return '';
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return '';
  return String(quantity);
}

export function formatQtyWithUnit(quantity?: string | number | null, unit?: string | null) {
  const qty = formatMrlQuantity(quantity);
  if (!qty) return '';
  const cleanUnit = normalizeMrlUnit(unit);
  return cleanUnit ? `${qty} ${cleanUnit}` : qty;
}

export function formatMrlSpec(value?: string | null) {
  return String(value ?? '').trim();
}

export function mrlIndex(index: number) {
  return String(index + 1).padStart(2, '0');
}

export type MrlLineView = {
  id?: string;
  name?: string;
  specification?: string | null;
  unit?: string | null;
  quantity?: string | number | null;
  notes?: string | null;
  amountLabel?: string | null;
};
