const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('./helpers/http');

describe('API versioning aliases', { timeout: 20000 }, () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    if (server) await server.close();
  });

  it('serves the same health payload on /api and /api/v1', async () => {
    const classic = await api(server.origin, { path: '/api/health' });
    const versioned = await api(server.origin, { path: '/api/v1/health' });
    assert.equal(classic.status, 200);
    assert.equal(versioned.status, 200);
    assert.equal(classic.json.success, true);
    assert.equal(versioned.json.success, true);
    assert.equal(classic.json.data.service, versioned.json.data.service);
  });
});
