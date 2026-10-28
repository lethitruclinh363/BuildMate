const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isBlockedPublicUpload } = require('../utils/public-uploads');

const ROOT = path.resolve(__dirname, '../..');

describe('isolated E2E public placeholder image', () => {
  it('keeps the placeholder outside /uploads/contractors so CCCD policy does not apply', () => {
    assert.equal(isBlockedPublicUpload('/uploads/e2e-placeholder.png'), false);
    assert.equal(isBlockedPublicUpload('/uploads/stores/demo/cover.png'), false);
    assert.equal(isBlockedPublicUpload('/uploads/contractors/owner-1/cccd.jpg'), true);
  });

  it('makes seed-e2e-browser-actors write the placeholder file on disk', () => {
    const seed = fs.readFileSync(path.join(ROOT, 'scripts/seed-e2e-browser-actors.js'), 'utf8');
    assert.match(seed, /ensureE2ePlaceholderFile/);
    const helper = fs.readFileSync(path.join(ROOT, 'scripts/test-db/ensure-e2e-placeholder.js'), 'utf8');
    assert.match(helper, /e2e-placeholder\.png/);
    assert.match(helper, /89504e47/);
  });
});
