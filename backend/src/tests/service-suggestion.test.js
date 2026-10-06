const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ROLES } = require('../models/User');
const { authorize } = require('../middleware/roleMiddleware');
const { serviceSuggestionSchema } = require('../validators/partner.validator');
const { createSuggestion } = require('../services/serviceSuggestionService');
const routes = require('../routes/serviceSuggestionRoutes');

function run(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err || null));
  });
}

describe('service suggestions', () => {
  it('rejects an empty description', () => {
    const parsed = serviceSuggestionSchema.safeParse({ description: '   ' });
    assert.equal(parsed.success, false);
  });

  it('accepts a description without a requester id from the client', () => {
    const parsed = serviceSuggestionSchema.safeParse({
      description: 'Sửa mái tôn, thay tôn cũ và xử lý dột mái',
      requesterId: 'someone-else',
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.requesterId, undefined);
  });

  it('does not save a short suggestion', async () => {
    await assert.rejects(
      () => createSuggestion({ description: 'mái', user: { id: 'x' }, profile: null }),
      (err) => err.statusCode === 400
    );
  });

  it('blocks a guest before a suggestion is stored', async () => {
    const post = routes.stack.find((layer) => layer.route && layer.route.path === '/' && layer.route.methods.post);
    const err = await run(post.route.stack[0].handle, { headers: {} });
    assert.equal(err.statusCode, 401);
  });

  it('blocks a material store owner from sending a contractor suggestion', async () => {
    const err = await run(authorize(ROLES.CONTRACTOR), { user: { role: ROLES.MATERIAL_STORE_OWNER } });
    assert.equal(err.statusCode, 403);
  });
});
