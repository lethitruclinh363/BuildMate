const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyError } = require('../utils/httpError');

describe('error mapping', () => {
  it('maps common statuses', () => {
    assert.equal(classifyError({ statusCode: 400, message: 'Bad' }).status, 400);
    assert.equal(classifyError({ statusCode: 401, message: 'Auth' }).status, 401);
    assert.equal(classifyError({ statusCode: 403, message: 'No' }).status, 403);
    assert.equal(classifyError({ name: 'CastError' }).status, 404);
    assert.equal(classifyError({ code: 'LIMIT_FILE_SIZE' }).status, 400);
    assert.equal(classifyError({ code: 11000 }).status, 409);
    assert.equal(classifyError(new Error('boom'), { isProd: true }).message, 'Internal server error');
    assert.equal(classifyError(new Error('boom'), { isProd: false }).status, 500);
  });
});
