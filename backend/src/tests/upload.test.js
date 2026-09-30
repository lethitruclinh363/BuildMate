const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { secureFilename, isAllowedFile } = require('../utils/upload');

describe('upload helpers', () => {
  it('builds a random filename with a safe extension', () => {
    const name = secureFilename('../../etc/passwd.png');
    assert.match(name, /^\d+-[a-f0-9]{16}\.png$/);
    assert.equal(name.includes('..'), false);
    assert.equal(name.includes('/'), false);
  });

  it('rejects unknown types', () => {
    assert.equal(isAllowedFile({ originalname: 'note.exe', mimetype: 'application/octet-stream' }), false);
    assert.equal(isAllowedFile({ originalname: 'site.jpg', mimetype: 'image/jpeg' }), true);
    assert.equal(isAllowedFile({ originalname: 'quote.pdf', mimetype: 'application/pdf' }), true);
  });
});
