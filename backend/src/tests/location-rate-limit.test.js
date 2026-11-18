const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { env } = require('../config/env');
const { apiLimiter, locationLimiter } = require('../middleware/rateLimitMiddleware');

describe('location API rate limiting', () => {
  it('keeps location searches available after the general API limit is reached', async (t) => {
    const previousEnabled = env.rateLimitEnabled;
    const previousMax = env.rateLimitMax;
    env.rateLimitEnabled = true;
    env.rateLimitMax = 1;

    const app = express();
    app.use('/api', apiLimiter());
    app.use('/api/location', locationLimiter());
    app.get('/api/general', (_req, res) => res.sendStatus(200));
    app.get('/api/location/contractors/nearby', (_req, res) => res.sendStatus(200));

    const server = app.listen(0);
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      env.rateLimitEnabled = previousEnabled;
      env.rateLimitMax = previousMax;
    });

    await new Promise((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    assert.equal((await fetch(`${origin}/api/general`)).status, 200);
    assert.equal((await fetch(`${origin}/api/general`)).status, 429);
    assert.equal((await fetch(`${origin}/api/location/contractors/nearby`)).status, 200);
  });
});
