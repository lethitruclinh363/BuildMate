const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { ROLES } = require('../models/User');
const { authorize } = require('../middleware/roleMiddleware');
const orderRoutes = require('../routes/material-order.routes');
const checkoutRoutes = require('../routes/material-checkout.routes');

function run(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err || null));
  });
}

describe('material cart authorization', () => {
  it('rejects a guest before a material order is created', async () => {
    const err = await run(authorize(ROLES.CUSTOMER), {});
    assert.equal(err.statusCode, 401);
  });

  it('rejects a contractor from the customer material order', async () => {
    const err = await run(authorize(ROLES.CUSTOMER), { user: { role: ROLES.CONTRACTOR } });
    assert.equal(err.statusCode, 403);
  });

  it('lets a customer through the role check', async () => {
    const err = await run(authorize(ROLES.CUSTOMER), { user: { role: ROLES.CUSTOMER } });
    assert.equal(err, null);
  });

  it('blocks a guest POST on the material order router', async () => {
    const guard = orderRoutes.stack.find((layer) => !layer.route).handle;
    const err = await run(guard, { headers: {} });
    assert.equal(err.statusCode, 401);
  });

  it('blocks a non-customer on the material order router', async () => {
    const guards = orderRoutes.stack.filter((layer) => !layer.route).map((layer) => layer.handle);
    const err = await run(guards[1], { user: { role: ROLES.CONTRACTOR } });
    assert.equal(err.statusCode, 403);
  });

  it('blocks a guest quote on material checkout', async () => {
    const quote = checkoutRoutes.stack.find((layer) => layer.route && layer.route.path === '/quote');
    const guard = quote.route.stack[0].handle;
    const err = await run(guard, { headers: {} });
    assert.equal(err.statusCode, 401);
  });
});
