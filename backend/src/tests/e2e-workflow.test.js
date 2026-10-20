const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createParty, cleanupParty } = require('./helpers/party');
const { testDatabaseReady } = require('./helpers/pg-cleanup');
const { payMockDeposit } = require('./helpers/finance-http');

describe('Sprint 5.3 E2E journeys A/B/C', { timeout: 90000 }, () => {
  let dbReady = false;
  let party;

  before(async () => {
    dbReady = testDatabaseReady();
  });

  after(async () => {
    await cleanupParty(party);
  });

  it('blocks STARTED until the 15% deposit is held, then completes handover once', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { customerAction } = require('../services/quotationService');
    const progressService = require('../services/progressService');
    const orderService = require('../services/orderService');
    const { QUOTATION_STATUS } = require('../models/Quotation');
    const { NOTIFICATION_TYPE } = require('../models/Notification');
    const { REQUEST_STATUS } = require('../models/RepairRequest');
    const { Quotation, RepairRequest } = require('../repositories/conversationAccess');
    const { Order, Payment, ProgressUpdate } = require('../repositories/commerceAccess');
    const { Notification } = require('../repositories/systemAccess');
    const { PAYMENT_TYPE } = require('../models/Payment');

    party = await createParty();

    const accepted = await customerAction(party.quotation._id, party.customer._id, 'accept');
    assert.equal(accepted.quotation.status, QUOTATION_STATUS.ACCEPTED);
    assert.equal(accepted.order.status, 'QUOTATION_ACCEPTED');
    assert.equal(accepted.payment.status, 'UNPAID');
    assert.equal(accepted.payment.type, PAYMENT_TYPE.DEPOSIT);
    assert.equal(accepted.notification.type, NOTIFICATION_TYPE.ORDER_CREATED);

    const quote = await Quotation.findById(party.quotation._id);
    assert.equal(quote.status, QUOTATION_STATUS.ACCEPTED);
    assert.equal(await Order.countDocuments({ quotationId: party.quotation._id }), 1);
    assert.equal(await Payment.countDocuments({ orderId: accepted.order.id }), 1);

    const again = await customerAction(party.quotation._id, party.customer._id, 'accept');
    assert.equal(String(again.order.id), String(accepted.order.id));
    assert.equal(await Order.countDocuments({ quotationId: party.quotation._id }), 1);

    const customerOrders = await orderService.listForCustomer(party.customer._id);
    assert.equal(customerOrders.some((row) => String(row.id) === String(accepted.order.id)), true);

    const contractorOrders = await orderService.listForContractor(party.contractor._id);
    assert.equal(contractorOrders.length, 1);

    const actor = { id: party.contractor._id, role: 'CONTRACTOR' };
    await assert.rejects(
      () => progressService.addProgress(accepted.order.id, actor, {
        status: 'STARTED',
        description: 'Must not start before deposit',
      }),
      (err) => err.statusCode === 409
    );
    assert.equal(await ProgressUpdate.countDocuments({ orderId: accepted.order.id }), 0);

    const paid = await payMockDeposit(party.customer, accepted.payment.id);
    assert.equal(paid.payment.status, 'PAID');
    assert.equal(paid.escrow.status, 'HELD');

    for (const status of ['STARTED', 'IN_PROGRESS', 'COMPLETED']) {
      await progressService.addProgress(accepted.order.id, actor, {
        status,
        description: `Site ${status.toLowerCase()}`,
      });
    }
    assert.equal(await ProgressUpdate.countDocuments({ orderId: accepted.order.id }), 3);
    assert.equal(
      await Notification.countDocuments({
        userId: party.customer._id,
        type: NOTIFICATION_TYPE.CONTRACTOR_ACCEPTED_JOB,
      }),
      1
    );
    assert.equal(
      await Notification.countDocuments({
        userId: party.customer._id,
        type: NOTIFICATION_TYPE.CONTRACTOR_UPDATED_PROGRESS,
      }),
      1
    );
    assert.equal(
      await Notification.countDocuments({
        userId: party.customer._id,
        type: NOTIFICATION_TYPE.CONTRACTOR_COMPLETED_JOB,
      }),
      1
    );
    assert.equal(
      await Notification.countDocuments({
        userId: party.customer._id,
        type: NOTIFICATION_TYPE.PROGRESS_UPDATED,
      }),
      0
    );

    const afterProgress = await Order.findById(accepted.order.id);
    assert.equal(afterProgress.status, 'COMPLETED');

    const done = await orderService.completeOrder(accepted.order.id, party.customer._id);
    assert.equal(done.order.status, 'CUSTOMER_ACCEPTED');
    const request = await RepairRequest.findById(party.request._id);
    assert.equal(request.status, REQUEST_STATUS.COMPLETED);
  });
});
