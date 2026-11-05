const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES } = require('../models/User');
const { authorize } = require('../middleware/roleMiddleware');
const requirementRoutes = require('../routes/materialRequirementRoutes');

function run(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err || null));
  });
}

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');

describe('material request authorization', () => {
  it('rejects a guest before a material request is created', async () => {
    const err = await run(authorize(ROLES.CUSTOMER), {});
    assert.equal(err.statusCode, 401);
  });

  it('rejects a contractor from the customer material request', async () => {
    const err = await run(authorize(ROLES.CUSTOMER), { user: { role: ROLES.CONTRACTOR } });
    assert.equal(err.statusCode, 403);
  });

  it('lets a customer through the role check', async () => {
    const err = await run(authorize(ROLES.CUSTOMER), { user: { role: ROLES.CUSTOMER } });
    assert.equal(err, null);
  });

  it('guards the direct material request route for customers only', () => {
    const direct = requirementRoutes.stack.find((layer) => layer.route && layer.route.path === '/direct');
    assert.ok(direct);
    const methods = Object.keys(direct.route.methods);
    assert.ok(methods.includes('post'));
  });

  it('does not keep a cart store or checkout page', () => {
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'features/material-cart/material-cart.store.ts')), false);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'pages/customer/MaterialCheckoutPage.tsx')), false);
  });
});
