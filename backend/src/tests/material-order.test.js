const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  generateMaterialOrderCode,
  MATERIAL_ORDER_STATUS,
  PLATFORM_FEE_RATE,
  DEPOSIT_RATE,
} = require('../utils/material-order.rules');

describe('historical material order helpers', () => {
  it('keeps status constants for leftover table mapping', () => {
    assert.equal(MATERIAL_ORDER_STATUS.COMPLETED, 'COMPLETED');
    assert.equal(PLATFORM_FEE_RATE, 0);
    assert.equal(DEPOSIT_RATE, 0);
    assert.match(generateMaterialOrderCode(), /^VL-/);
  });

  it('removes purchase-order create and checkout runtime', () => {
    const root = path.join(__dirname, '..');
    assert.equal(fs.existsSync(path.join(root, 'services/material-order.service.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'routes/material-order.routes.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'validators/material-order.validator.js')), false);
  });
});
