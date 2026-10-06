const { ApiError } = require('../utils/ApiError');

const VIETMAP_ORIGIN = 'https://maps.vietmap.vn';
const DISPLAY_TYPE = '5';
const TIMEOUT_MS = 8000;

function boundaryName(boundaries, type) {
  const row = (Array.isArray(boundaries) ? boundaries : []).find((item) => Number(item && item.type) === type);
  if (!row) return '';
  return String(row.full_name || row.name || '').trim();
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && typeof payload === 'object' && (payload.display || payload.ref_id || payload.lat != null)) {
    return [payload];
  }
  return [];
}

function compact(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

function adminParts(row) {
  const old = row && row.data_old;
  const district = boundaryName(row && row.boundaries, 1) || boundaryName(old && old.boundaries, 1);
  return compact({
    ward: boundaryName(row && row.boundaries, 2),
    district,
    city: boundaryName(row && row.boundaries, 0),
  });
}

function toSuggestion(row) {
  const refId = String((row && row.ref_id) || '').trim();
  if (!refId) return null;
  const name = String((row && row.name) || '').trim();
  const display = String((row && row.display) || name).trim();
  const address = String((row && row.address) || '').trim();
  const distance = Number(row && row.distance);
  return compact({
    refId,
    name,
    display,
    address,
    distance: Number.isFinite(distance) ? distance : undefined,
    ...adminParts(row),
  });
}

function toPlace(row, fallback = {}) {
  const lat = Number(row && row.lat != null ? row.lat : fallback.lat);
  const lng = Number(row && row.lng != null ? row.lng : fallback.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const display = String((row && (row.display || row.address || row.name)) || '').trim();
  const district = String((row && row.district) || '').trim() || boundaryName(row && row.boundaries, 1);
  const ward = String((row && row.ward) || '').trim() || boundaryName(row && row.boundaries, 2);
  const city = String((row && row.city) || '').trim() || boundaryName(row && row.boundaries, 0);
  return compact({
    address: display,
    display,
    lat,
    lng,
    refId: String((row && row.ref_id) || fallback.refId || '').trim(),
    ward,
    district,
    city,
  });
}

function assertCoordinates(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError(400, 'Coordinates are invalid');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(400, 'Coordinates are invalid');
  }
  return { lat: latitude, lng: longitude };
}

function vietmapLabel(path) {
  if (String(path).includes('autocomplete')) return 'autocomplete';
  if (String(path).includes('/place/')) return 'place';
  if (String(path).includes('reverse')) return 'reverse';
  return 'request';
}

function scrubProvider(value) {
  return String(value || '')
    .replace(/apikey=[^&\s"']+/gi, 'apikey=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function devDetails(details) {
  if (process.env.NODE_ENV === 'production') return null;
  return details;
}

function messageForStatus(status) {
  if (status === 401) return 'VietMap API key không hợp lệ.';
  if (status === 423) return 'VietMap Services key hết quota hoặc API chưa được bật.';
  if (status === 429) return 'VietMap đang giới hạn số request.';
  if (status >= 500) return 'Dịch vụ VietMap tạm thời không khả dụng.';
  return 'Address lookup is unavailable';
}

function failVietMap(path, status, body) {
  const safe = scrubProvider(body) || 'empty response';
  console.error(`[VietMap ${vietmapLabel(path)}] status=${status} message=${safe}`);
  const httpStatus = status === 401 || status === 423 || status === 429 ? status : 502;
  throw new ApiError(
    httpStatus,
    messageForStatus(status),
    devDetails({ code: 'VIETMAP_UNAVAILABLE', providerStatus: status })
  );
}

async function readBody(res) {
  if (res && typeof res.text === 'function') return res.text();
  if (res && typeof res.json === 'function') {
    try {
      return JSON.stringify(await res.json());
    } catch {
      return '';
    }
  }
  return '';
}

async function vietmapGet(path, params, deps = {}) {
  const apiKey = String((deps.apiKey != null ? deps.apiKey : process.env.VIETMAP_API_KEY) || '').trim();
  if (!apiKey) {
    console.error(`[VietMap ${vietmapLabel(path)}] status=0 message=VIETMAP_API_KEY is not configured`);
    throw new ApiError(
      503,
      'VietMap Services key is not configured',
      devDetails({ code: 'VIETMAP_NOT_CONFIGURED' })
    );
  }
  const url = new URL(path, VIETMAP_ORIGIN);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const request = deps.fetch || fetch;
  const timeoutMs = deps.timeoutMs || TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await request(url, {
      signal: deps.signal || controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res || !res.ok) {
      const status = Number(res && res.status) || 502;
      failVietMap(path, status, await readBody(res));
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    failVietMap(path, aborted ? 504 : 502, aborted ? 'timeout' : err && err.message);
  } finally {
    clearTimeout(timer);
  }
}

async function autocomplete(query, focus = {}, deps = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];
  const params = { text, display_type: DISPLAY_TYPE };
  const lat = Number(focus.lat);
  const lng = Number(focus.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    params.focus = `${lat},${lng}`;
  }
  const payload = await vietmapGet('/api/autocomplete/v4', params, deps);
  return asList(payload).map(toSuggestion).filter(Boolean);
}

async function place(refId, deps = {}) {
  const id = String(refId || '').trim();
  if (id.length < 3) {
    throw new ApiError(400, 'Place reference is invalid');
  }
  const payload = await vietmapGet('/api/place/v4', { refid: id }, deps);
  const row = asList(payload)[0] || null;
  const hit = toPlace(row, { refId: id });
  if (!hit) {
    throw new ApiError(502, 'Address lookup is unavailable');
  }
  return hit;
}

async function reverse(lat, lng, deps = {}) {
  const point = assertCoordinates(lat, lng);
  const payload = await vietmapGet(
    '/api/reverse/v4',
    { lat: point.lat, lng: point.lng, display_type: DISPLAY_TYPE },
    deps
  );
  const row = asList(payload)[0];
  return toPlace(row, point) || { address: '', display: '', lat: point.lat, lng: point.lng };
}

module.exports = { autocomplete, place, reverse, DISPLAY_TYPE };
