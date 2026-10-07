const { LocationCorrection } = require('../repositories/systemAccess');
const { toGeoPoint } = require('../utils/geo');

const SOURCES = new Set(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']);

function normalizeAddress(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function confirmedFlag(value) {
  return value === true || value === 'true';
}

function locationSourceOf(value) {
  const source = String(value || '').trim();
  if (source === 'VIETMAP_AUTOCOMPLETE') return 'VIETMAP_PLACE';
  if (source === 'MAP_PIN') return 'MANUAL_PIN';
  return SOURCES.has(source) ? source : 'MANUAL_PIN';
}

async function record({ address, lat, lng, refId }) {
  const normalizedAddress = normalizeAddress(address);
  const point = toGeoPoint(lat, lng);
  if (!normalizedAddress || normalizedAddress.length < 4 || !point) return null;
  return LocationCorrection.findOneAndUpdate(
    { normalizedAddress },
    {
      $set: {
        location: point,
        providerRefId: String(refId || '').slice(0, 2000),
        lastConfirmedAt: new Date(),
      },
      $inc: { confirmedCount: 1 },
      $setOnInsert: { normalizedAddress },
    },
    { upsert: true, new: true }
  );
}

async function prefer(place) {
  if (!place) return place;
  const refId = String(place.refId || '').trim();
  const normalizedAddress = normalizeAddress(place.display || place.address);
  const query = [];
  if (refId) query.push({ providerRefId: refId });
  if (normalizedAddress.length >= 4) query.push({ normalizedAddress });
  if (!query.length) return place;
  const row = await LocationCorrection.findOne({ $or: query }).sort({ confirmedCount: -1, lastConfirmedAt: -1 });
  const coordinates = row && row.location && row.location.coordinates;
  const lng = Number(coordinates && coordinates[0]);
  const lat = Number(coordinates && coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return place;
  return { ...place, lat, lng, corrected: true };
}

module.exports = { normalizeAddress, confirmedFlag, locationSourceOf, record, prefer };
