const { ApiError } = require('../utils/ApiError');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'BuildMate/1.0 (location module)';

function toHit(row, fallbackLat, fallbackLng) {
  const rawLng = row && (row.lon != null ? row.lon : row.lng);
  const lat = Number(row && row.lat != null ? row.lat : fallbackLat);
  const lng = Number(rawLng != null ? rawLng : fallbackLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    label: String((row && row.display_name) || '').trim(),
    lat,
    lng,
  };
}

async function readJson(res) {
  if (!res || !res.ok) {
    throw new ApiError(502, 'Address lookup is unavailable');
  }
  return res.json();
}

async function geocodeAddress(query, deps = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const request = deps.fetch || fetch;
  const url = new URL('/search', NOMINATIM);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', q);
  const res = await request(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  const rows = await readJson(res);
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => toHit(row)).filter(Boolean);
}

async function reverseGeocode(lat, lng, deps = {}) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ApiError(400, 'Coordinates are invalid');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ApiError(400, 'Coordinates are invalid');
  }
  const request = deps.fetch || fetch;
  const url = new URL('/reverse', NOMINATIM);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  const res = await request(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  const row = await readJson(res);
  return toHit(row, latitude, longitude) || { label: '', lat: latitude, lng: longitude };
}

module.exports = { geocodeAddress, reverseGeocode };
