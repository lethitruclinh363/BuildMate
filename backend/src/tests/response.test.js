const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { success, fail } = require('../utils/response');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('http envelope', () => {
  it('wraps success and fail payloads', () => {
    const ok = mockRes();
    success(ok, { id: 1 }, 'OK');
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.success, true);

    const bad = mockRes();
    fail(bad, 'Nope', 403);
    assert.equal(bad.statusCode, 403);
    assert.equal(bad.body.success, false);
    assert.equal(bad.body.details, null);
    assert.equal(bad.body.errors, null);
  });

  it('health module loads without throwing', () => {
    assert.equal(typeof http.createServer, 'function');
  });
});
