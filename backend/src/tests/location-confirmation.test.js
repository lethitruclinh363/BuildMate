const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAddress, confirmedFlag, locationSourceOf } = require('../services/locationCorrection.service');

describe('location confirmation', () => {
  it('normalizes an address without treating it as coordinates', () => {
    assert.equal(
      normalizeAddress('216 Đường 3 Tháng 2, Phường Tân An, Thành phố Cần Thơ'),
      '216 duong 3 thang 2 phuong tan an thanh pho can tho'
    );
  });

  it('accepts only an explicit confirmation flag', () => {
    assert.equal(confirmedFlag(true), true);
    assert.equal(confirmedFlag('true'), true);
    assert.equal(confirmedFlag(false), false);
    assert.equal(confirmedFlag('false'), false);
    assert.equal(confirmedFlag(undefined), false);
  });

  it('keeps Place, GPS, and a manual pin distinct', () => {
    assert.equal(locationSourceOf('VIETMAP_PLACE'), 'VIETMAP_PLACE');
    assert.equal(locationSourceOf('VIETMAP_AUTOCOMPLETE'), 'VIETMAP_PLACE');
    assert.equal(locationSourceOf('GPS'), 'GPS');
    assert.equal(locationSourceOf('MAP_PIN'), 'MANUAL_PIN');
    assert.equal(locationSourceOf('MANUAL_PIN'), 'MANUAL_PIN');
  });
});
