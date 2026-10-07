function legacyOf(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object') {
    if (value.$in || value.$ne || value.$gt || value.$lt || value.$regex || value.$exists !== undefined) return '';
    return String(value._id || value.id || '');
  }
  return String(value);
}

function legacyClause(value) {
  if (value && typeof value === 'object' && (value.$in || value.$ne || value.$gt || value.$lt || value.$regex || value.$exists !== undefined)) {
    if (!value.$in) return null;
    const ids = value.$in.map((item) => legacyOf(item)).filter(Boolean);
    if (!ids.length) return { in: [] };
    return ids.length === 1 ? ids[0] : { in: ids };
  }
  const id = legacyOf(value);
  if (!id) return { in: [] };
  return id;
}

function enumClause(value) {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value && Array.isArray(value.$in)) {
    const items = value.$in.filter((item) => typeof item === 'string');
    if (!items.length) return { in: [] };
    return items.length === 1 ? items[0] : { in: items };
  }
  if (value && typeof value.$ne === 'string') return { not: value.$ne };
  return null;
}

function compareClause(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '$gt')) {
    const number = Number(value.$gt);
    if (!Number.isFinite(number)) return null;
    return { gt: number };
  }
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '$lt')) {
    const date = value.$lt instanceof Date ? value.$lt : new Date(value.$lt);
    if (Number.isNaN(date.getTime())) return null;
    return { lt: date };
  }
  return null;
}

module.exports = { legacyOf, legacyClause, enumClause, compareClause };
