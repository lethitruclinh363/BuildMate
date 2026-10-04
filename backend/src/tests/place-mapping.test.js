const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { distanceKm, describePlace, directionsUrl, gpsErrorKind, mapSearchUrl, requirePlace } = require('../utils/geo');
const { summarizeMaterialCheckout } = require('../utils/material-checkout');
const { sanitizeChatLocation } = require('../utils/chat-location');
const { geoNearStage } = require('../services/location.service');

const policy = {
  deliveryEnabled: true,
  serviceRadiusKm: 10,
  baseDeliveryFee: 30000,
  freeDeliveryRadiusKm: 2,
  deliveryFeePerKm: 8000,
  minimumOrderAmount: 0,
};

describe('shared place mapping', () => {
  it('saves a repair pin as GeoJSON [lng, lat] and reads it back after reload', () => {
    const saved = requirePlace({ lat: 10.03, lng: 105.78, address: ' Ninh Kiều ', label: 'Công trình' });
    assert.deepEqual(saved.point, { type: 'Point', coordinates: [105.78, 10.03] });
    const reloaded = describePlace({ location: saved.point, address: saved.address });
    assert.deepEqual(reloaded, { lat: 10.03, lng: 105.78, address: 'Ninh Kiều', label: 'Ninh Kiều' });
  });

  it('reads a material delivery pin from deliveryLocation, not a second coordinate field', () => {
    const saved = requirePlace(
      { lat: 10.05, lng: 105.75, address: 'Địa điểm giao', label: 'Địa điểm giao' },
      { addressMax: 240, labelMax: 240 }
    );
    const reloaded = describePlace({ deliveryLocation: saved.point, deliveryAddress: saved.address });
    assert.equal(reloaded.lat, saved.lat);
    assert.equal(reloaded.lng, saved.lng);
    assert.equal(reloaded.address, 'Địa điểm giao');
  });

  it('rejects a pin outside the valid range and a missing pin', () => {
    assert.equal(requirePlace({ lat: 95, lng: 105.7, address: 'A' }), null);
    assert.equal(requirePlace({ lat: 10, lng: 190, address: 'A' }), null);
    assert.equal(requirePlace(null), null);
  });

  it('keeps chat LOCATION in the same place shape used by repair and checkout', () => {
    const location = sanitizeChatLocation({ lat: 10.1, lng: 105.7, address: 'A', label: 'B' });
    assert.deepEqual(describePlace(location), location);
    assert.deepEqual(describePlace({ place: location }), location);
  });

  it('prices shipping from the selected delivery coordinates', () => {
    const store = { lat: 10.045, lng: 105.746 };
    const selected = { lat: 10.045 + 7 / 111.195, lng: 105.746 };
    const km = distanceKm(store, selected);
    assert.ok(Math.abs(km - 7) < 0.05);
    assert.equal(distanceKm(store, store), 0);
    const quote = summarizeMaterialCheckout({ policy, distanceKm: km, materialSubtotal: 500000 });
    assert.equal(quote.ok, true);
    assert.ok(Math.abs(quote.distanceKm - 7) < 0.05);
    assert.ok(quote.shippingFee > policy.baseDeliveryFee);
    const atStore = summarizeMaterialCheckout({ policy, distanceKm: 0, materialSubtotal: 500000 });
    assert.notEqual(quote.shippingFee, atStore.shippingFee);
  });

  it('builds a Google Maps directions link and can include an origin', () => {
    assert.equal(
      directionsUrl(10.045, 105.746),
      'https://www.google.com/maps/dir/?api=1&destination=10.045%2C105.746'
    );
    assert.match(directionsUrl(10.045, 105.746, { lat: 10.03, lng: 105.77 }), /origin=10\.03%2C105\.77/);
    assert.equal(mapSearchUrl(10.045, 105.746), 'https://www.google.com/maps/search/?api=1&query=10.045,105.746');
  });

  it('maps a denied GPS code separately from an unavailable fix', () => {
    assert.equal(gpsErrorKind(1), 'denied');
    assert.equal(gpsErrorKind(2), 'unavailable');
    assert.equal(gpsErrorKind(3), 'unavailable');
  });

  it('keeps nearby search on GeoJSON metres for 3, 5 and 10 km', () => {
    assert.equal(geoNearStage(10.045, 105.746, 3).maxDistance, 3000);
    assert.equal(geoNearStage(10.045, 105.746, 5).maxDistance, 5000);
    assert.equal(geoNearStage(10.045, 105.746, 10).maxDistance, 10000);
    assert.deepEqual(geoNearStage(10.045, 105.746, 5).near.coordinates, [105.746, 10.045]);
  });
});
