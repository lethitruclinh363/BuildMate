const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { presentDistance, geoNearStage } = require('../services/location.service');

describe('explore map distance', () => {
  it('keeps GeoJSON order and queries 3, 5, and 10 km with $geoNear', () => {
    for (const km of [3, 5, 10]) {
      const stage = geoNearStage(10.045, 105.746, km);
      assert.deepEqual(stage.near, { type: 'Point', coordinates: [105.746, 10.045] });
      assert.equal(stage.maxDistance, km * 1000);
      assert.equal(stage.spherical, true);
      assert.equal(stage.distanceField, 'distanceMeters');
    }
  });

  it('returns authoritative metres and kilometres from the geo distance', () => {
    assert.deepEqual(presentDistance(850), { distanceMeters: 850, distance: 0.85 });
    assert.deepEqual(presentDistance(999.4), { distanceMeters: 999, distance: 1 });
    assert.deepEqual(presentDistance(1250), { distanceMeters: 1250, distance: 1.25 });
    assert.deepEqual(presentDistance(10000), { distanceMeters: 10000, distance: 10 });
  });
});
