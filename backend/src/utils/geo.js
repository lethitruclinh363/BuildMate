function toRad(degrees) {
  return (Number(degrees) * Math.PI) / 180;
}

/** Spherical distance in kilometres. Store GeoJSON is [lng, lat]. */
function distanceKm(from, to) {
  const lat1 = Number(from?.lat);
  const lng1 = Number(from?.lng);
  const lat2 = Number(to?.lat);
  const lng2 = Number(to?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return NaN;

  const earthKm = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Schema placeholder in Store.location. It is not a pin the owner chose. */
const UNSET_LOCATION = Object.freeze([105.787, 10.045]);

function isUnsetLocation(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Math.abs(longitude - UNSET_LOCATION[0]) < 1e-6 && Math.abs(latitude - UNSET_LOCATION[1]) < 1e-6;
}

const place = require('../../../shared/place');

module.exports = {
  distanceKm,
  isUnsetLocation,
  UNSET_LOCATION,
  toGeoPoint: place.toGeoPoint,
  fromGeoPoint: place.fromGeoPoint,
  requirePlace: place.requirePlace,
  describePlace: place.describePlace,
  directionsUrl: place.directionsUrl,
  mapSearchUrl: place.mapSearchUrl,
  gpsErrorKind: place.gpsErrorKind,
  cleanPlaceText: place.cleanPlaceText,
};
