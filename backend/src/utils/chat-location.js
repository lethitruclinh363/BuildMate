const { requirePlace, cleanPlaceText } = require('./geo');

function sanitizeChatLocation(input) {
  const place = requirePlace(input, { addressMax: 300, labelMax: 120 });
  if (!place) return null;
  return { lat: place.lat, lng: place.lng, address: place.address, label: place.label };
}

module.exports = { sanitizeChatLocation, cleanText: cleanPlaceText };
