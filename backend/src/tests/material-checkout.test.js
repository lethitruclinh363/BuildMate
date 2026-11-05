const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { distanceKm } = require('../utils/geo');

describe('material checkout distance helpers remain for maps', () => {
  it('measures zero between the same point', () => {
    const point = { lat: 10.045, lng: 105.746 };
    assert.equal(distanceKm(point, point), 0);
  });

  it('measures about one kilometre due north', () => {
    const km = distanceKm({ lat: 10.045, lng: 105.746 }, { lat: 10.045 + 1 / 111.195, lng: 105.746 });
    assert.ok(Math.abs(km - 1) < 0.02);
  });

  it('removes checkout quote runtime', () => {
    const root = path.join(__dirname, '..');
    assert.equal(fs.existsSync(path.join(root, 'utils/material-checkout.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'services/material-checkout.service.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'routes/material-checkout.routes.js')), false);
  });
});
