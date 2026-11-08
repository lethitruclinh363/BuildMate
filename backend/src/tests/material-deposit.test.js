const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('material deposit runtime', () => {
  it('removes discontinued material deposit checkout and capture', () => {
    const root = path.join(__dirname, '..');
    assert.equal(fs.existsSync(path.join(root, 'services/material-deposit.service.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'utils/material-deposit.rules.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'validators/material-order.validator.js')), false);
  });
});
