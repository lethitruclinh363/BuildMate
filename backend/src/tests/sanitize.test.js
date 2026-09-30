const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeValue } = require('../middleware/sanitize.middleware');

describe('mongo sanitize', () => {
  it('strips $ and dotted keys', () => {
    const input = {
      email: 'a@b.c',
      $gt: '',
      'profile.role': 'ADMIN',
      nested: { name: 'ok', $where: '1' },
    };
    assert.deepEqual(sanitizeValue(input), {
      email: 'a@b.c',
      nested: { name: 'ok' },
    });
  });
});
