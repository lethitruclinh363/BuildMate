const { LocationCorrection } = require('../repositories/systemAccess');
const { hasCoordinates, toGeoPoint } = require('../utils/geo');

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

function correctionPoint(row) {
  const coordinates = row && row.location && row.location.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!hasCoordinates(lat, lng)) return null;
  return { lat, lng };
}

async function record({ address, lat, lng, refId }) {
  const normalizedAddress = normalizeAddress(address);
  const point = toGeoPoint(lat, lng);
  if (!normalizedAddress || normalizedAddress.length < 4 || !point || !hasCoordinates(lat, lng)) return null;
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
  const point = correctionPoint(row);
  if (!point) return place;
  return { ...place, lat: point.lat, lng: point.lng, corrected: true };
}

module.exports = { normalizeAddress, confirmedFlag, locationSourceOf, correctionPoint, record, prefer };
