const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toGeoPoint, fromGeoPoint } = require('../utils/geo');
const { geocodeAddress, reverseGeocode } = require('../services/geocoding.service');
const { ApiError } = require('../utils/ApiError');

describe('location core', () => {
  it('stores GeoJSON as [longitude, latitude]', () => {
    const point = toGeoPoint(10.045, 105.746);
    assert.deepEqual(point, { type: 'Point', coordinates: [105.746, 10.045] });
    assert.deepEqual(fromGeoPoint(point), { lat: 10.045, lng: 105.746 });
    assert.equal(toGeoPoint(95, 105), null);
    assert.equal(toGeoPoint(10, 200), null);
    assert.equal(fromGeoPoint({ type: 'Point', coordinates: [200, 10] }), null);
  });

  it('geocodes through the service and keeps lat/lng named', async () => {
    const hits = await geocodeAddress('Ninh Kieu', {
      fetch: async (url) => {
        assert.match(String(url), /nominatim\.openstreetmap\.org\/search/);
        assert.match(String(url), /q=Ninh\+Kieu/);
        return {
          ok: true,
          json: async () => [{ display_name: 'Ninh Kiều, Cần Thơ', lat: '10.034', lon: '105.788' }],
        };
      },
    });
    assert.deepEqual(hits, [{ label: 'Ninh Kiều, Cần Thơ', lat: 10.034, lng: 105.788 }]);
    assert.deepEqual(await geocodeAddress('ab'), []);
  });

  it('reverse geocodes a point and rejects bad coordinates before calling the provider', async () => {
    const hit = await reverseGeocode(10.045, 105.746, {
      fetch: async (url) => {
        const href = String(url);
        assert.match(href, /\/reverse/);
        assert.match(href, /lat=10\.045/);
        assert.match(href, /lon=105\.746/);
        return { ok: true, json: async () => ({ display_name: 'Cần Thơ' }) };
      },
    });
    assert.deepEqual(hit, { label: 'Cần Thơ', lat: 10.045, lng: 105.746 });
    await assert.rejects(() => reverseGeocode(10, 200, { fetch: async () => assert.fail('fetch') }), ApiError);
  });
});
