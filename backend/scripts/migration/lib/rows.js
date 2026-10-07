function ident(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return name;
}

function oid(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return String(value);
}

function text(value) {
  if (value === undefined || value === null) return null;
  const out = String(value).trim();
  return out === '' ? null : out;
}

function dateOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numeric(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric amount: ${value}`);
  if (Number.isInteger(n)) return String(n);
  const cents = Math.round((n + Number.EPSILON) * 100) / 100;
  if (Math.abs(cents - n) < 1e-8) return cents.toFixed(2);
  return n.toString();
}

function jsonbValue(schema, table, columnName, value) {
  const meta = schema[table]?.columns?.[columnName];
  if (!meta) return undefined;
  if (meta.udtName !== 'jsonb' && meta.dataType !== 'jsonb') {
    throw new Error(`${table}.${columnName} is ${meta.dataType}, not jsonb`);
  }
  return JSON.stringify(value ?? {});
}

function column(schema, table, candidates) {
  const cols = schema[table]?.columns || {};
  return candidates.find((name) => cols[name]) || null;
}

function requireColumn(schema, table, candidates, label) {
  const found = column(schema, table, candidates);
  if (!found) {
    const live = Object.keys(schema[table]?.columns || {}).join(', ') || '(table missing)';
    throw new Error(`No column for ${label} on public.${table}. Live columns: ${live}`);
  }
  return found;
}

function setColumn(schema, table, row, candidates, value) {
  const found = column(schema, table, candidates);
  if (!found) return false;
  row[found] = value;
  return true;
}

function requireTable(schema, table) {
  if (!schema[table]) {
    const similar = Object.keys(schema).filter((name) => name.includes(table.split('_')[0])).join(', ');
    throw new Error(`Missing public.${table}. Similar tables: ${similar || '(none)'}`);
  }
}

function unfilledRequired(schema, table, row) {
  const cols = schema[table].columns;
  return Object.entries(cols)
    .filter(([name, meta]) => {
      if (name === 'id') return false;
      if (meta.nullable) return false;
      if (meta.default != null) return false;
      return !Object.prototype.hasOwnProperty.call(row, name);
    })
    .map(([name]) => name);
}

async function insertRow(pg, table, row) {
  const cols = Object.keys(row);
  if (!cols.length) throw new Error(`Refusing empty insert into ${table}`);
  const sql = `INSERT INTO public.${ident(table)} (${cols.map(ident).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`;
  const result = await pg.query(sql, cols.map((name) => row[name]));
  return result.rows[0].id;
}

async function loadLegacyMap(pg, table) {
  const result = await pg.query(
    `SELECT id, legacy_mongo_id FROM public.${ident(table)} WHERE legacy_mongo_id IS NOT NULL`,
  );
  return new Map(result.rows.map((row) => [row.legacy_mongo_id, row.id]));
}

function coordinates(doc) {
  const coords = doc?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

module.exports = {
  ident,
  oid,
  text,
  dateOrNull,
  numOrNull,
  numeric,
  jsonbValue,
  column,
  requireColumn,
  setColumn,
  requireTable,
  unfilledRequired,
  insertRow,
  loadLegacyMap,
  coordinates,
};
