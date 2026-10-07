const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('./helpers/http');
const { createParty, cleanupParty, createUser, deleteFixtureUsers, ROLES } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { NOTIFICATION_TYPE } = require('../models/Notification');
const { Order, Payment } = require('../repositories/commerceAccess');
const { Notification } = require('../repositories/systemAccess');
const { signToken } = require('../services/authService');

describe('Sprint 5.3 edge cases', { timeout: 90000 }, () => {
  let dbReady = false;
  let server;
  const trash = [];

  before(async () => {
    dbReady = testDatabaseReady();
    if (!dbReady) return;
    server = await startTestServer();
  });

  after(async () => {
    if (server) await server.close();
    for (const party of trash) await cleanupParty(party);
  });

  it('1. accept quotation twice → one order, one payment, one ORDER_CREATED notification', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const { customerAction } = require('../services/quotationService');
    const party = await createParty(`dup-${Date.now()}`);
    trash.push(party);
    await customerAction(party.quotation._id, party.customer._id, 'accept');
    await customerAction(party.quotation._id, party.customer._id, 'accept');
    const orders = await Order.find({ quotationId: party.quotation._id });
    assert.equal(orders.length, 1);
    assert.equal(await Payment.countDocuments({ orderId: orders[0]._id }), 1);
    assert.equal(
      await Notification.countDocuments({
        userId: party.contractor._id,
        type: NOTIFICATION_TYPE.ORDER_CREATED,
        'meta.quotationId': String(party.quotation._id),
      }),
      1
    );
  });

  it('2. second contractor cannot update progress on another contractor order', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const { customerAction } = require('../services/quotationService');
    const progressService = require('../services/progressService');
    const party = await createParty(`busy-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');

    const other = await createUser({
      name: 'Rival Co',
      email: `e2e.rival.${Date.now()}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    let denied = null;
    try {
      await progressService.addProgress(accepted.order.id, { id: other._id, role: 'CONTRACTOR' }, {
        status: 'STARTED',
        description: 'Not this contractor',
      });
    } catch (err) {
      denied = err;
    }
    assert.equal(denied?.statusCode, 403);
    await deleteFixtureUsers([other._id]);
  });

  it('3. contractor cannot update a completed order', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const { customerAction } = require('../services/quotationService');
    const progressService = require('../services/progressService');
    const orderService = require('../services/orderService');
    const party = await createParty(`closed-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const actor = { id: party.contractor._id, role: 'CONTRACTOR' };
    await progressService.addProgress(accepted.order.id, actor, {
      status: 'STARTED',
      description: 'Started on site',
    });
    await progressService.addProgress(accepted.order.id, actor, {
      status: 'IN_PROGRESS',
      description: 'Working',
    });
    const finished = await progressService.addProgress(accepted.order.id, actor, {
      status: 'COMPLETED',
      description: 'Done',
    });
    assert.equal(finished.order.status, 'COMPLETED');
    assert.equal(finished.progress.status, 'COMPLETED');

    let afterFinish = null;
    try {
      await progressService.addProgress(accepted.order.id, actor, {
        status: 'IN_PROGRESS',
        description: 'Too late',
      });
    } catch (err) {
      afterFinish = err;
    }
    assert.equal(afterFinish?.statusCode, 409);

    await orderService.completeOrder(accepted.order.id, party.customer._id);

    let closed = null;
    try {
      await progressService.addProgress(accepted.order.id, actor, {
        status: 'IN_PROGRESS',
        description: 'Too late',
      });
    } catch (err) {
      closed = err;
    }
    assert.equal(closed?.statusCode, 409);
  });

  it('4. customer cannot accept before the job is COMPLETED', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const { customerAction } = require('../services/quotationService');
    const orderService = require('../services/orderService');
    const party = await createParty(`early-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    let early = null;
    try {
      await orderService.completeOrder(accepted.order.id, party.customer._id);
    } catch (err) {
      early = err;
    }
    assert.equal(early?.statusCode, 409);
  });

  it('5. unauthorized user gets 403 on order detail', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }
    const { customerAction } = require('../services/quotationService');
    const party = await createParty(`unauth-${Date.now()}`);
    trash.push(party);
    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    const res = await api(server.origin, {
      path: `/api/orders/${accepted.order.id}`,
      token: party.tokens.stranger,
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.success, false);
    assert.equal('errors' in res.json, true);
  });
});
