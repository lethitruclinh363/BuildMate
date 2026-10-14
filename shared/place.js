function cleanPlaceText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function toGeoPoint(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { type: 'Point', coordinates: [longitude, latitude] };
}

function hasCoordinates(lat, lng) {
  const point = toGeoPoint(lat, lng);
  if (!point) return false;
  return point.coordinates[0] !== 0 || point.coordinates[1] !== 0;
}

function fromGeoPoint(point) {
  const coordinates = point && point.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
}

function requirePlace(input, limits = {}) {
  if (!input || typeof input !== 'object') return null;
  const point = toGeoPoint(input.lat, input.lng);
  if (!point) return null;
  const address = cleanPlaceText(input.address, limits.addressMax ?? 300);
  const label = cleanPlaceText(input.label, limits.labelMax ?? 120);
  return {
    lat: point.coordinates[1],
    lng: point.coordinates[0],
    address,
    label,
    point,
  };
}

function describePlace(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.place) {
    const nested = describePlace(source.place);
    if (nested) return nested;
  }
  const geo = fromGeoPoint(source.deliveryLocation || source.location);
  if (geo) {
    const address = cleanPlaceText(source.deliveryAddress || source.address, 300);
    const label = cleanPlaceText(source.label, 120) || address;
    return { lat: geo.lat, lng: geo.lng, address, label };
  }
  const direct = requirePlace(source);
  if (!direct) return null;
  return {
    lat: direct.lat,
    lng: direct.lng,
    address: direct.address,
    label: direct.label || direct.address,
  };
}

function directionsUrl(lat, lng, origin) {
  const params = new URLSearchParams({ api: '1', destination: `${lat},${lng}` });
  if (origin && toGeoPoint(origin.lat, origin.lng)) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function mapSearchUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function gpsErrorKind(code) {
  return Number(code) === 1 ? 'denied' : 'unavailable';
}

module.exports = {
  cleanPlaceText,
  toGeoPoint,
  hasCoordinates,
  fromGeoPoint,
  requirePlace,
  describePlace,
  directionsUrl,
  mapSearchUrl,
  gpsErrorKind,
};
