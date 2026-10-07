const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createUser } = require('./helpers/party');
const { deleteFixtureUsers, testDatabaseReady } = require('./helpers/pg-cleanup');
let dbReady = false;

const ids = {
  users: [],
  requests: [],
  quotations: [],
  orders: [],
  payments: [],
  progress: [],
  notifications: [],
};

describe('Sprint 5.1 order execution flow', { timeout: 60000 }, () => {
  before(async () => {
    dbReady = testDatabaseReady();
  });

  after(async () => {
    if (!dbReady) return;
    await deleteFixtureUsers(ids.users);
  });

  it('accepts a quotation once, lets the contractor record progress, and blocks a duplicate order', async (t) => {
    if (!dbReady) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { ROLES } = require('../models/user.model');
    const { REPAIR_CATEGORY, REQUEST_STATUS } = require('../models/RepairRequest');
    const { QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../models/Quotation');
    const { NOTIFICATION_TYPE } = require('../models/Notification');
    const { Quotation } = require('../repositories/conversationAccess');
    const repairAccess = require('../repositories/conversationAccess');
    const { Order, Payment, ProgressUpdate } = require('../repositories/commerceAccess');
    const { Notification } = require('../repositories/systemAccess');
    const { customerAction } = require('../services/quotationService');
    const progressService = require('../services/progressService');

    const stamp = Date.now();
    const customer = await createUser({
      name: 'Sprint51 Customer',
      email: `s51.customer.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
    });
    const contractor = await createUser({
      name: 'Sprint51 Contractor',
      email: `s51.contractor.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
    });
    ids.users.push(customer._id, contractor._id);

    const request = await repairAccess.RepairRequest.create({
      customerId: customer._id,
      contractorId: contractor._id,
      category: REPAIR_CATEGORY.PLUMBING,
      title: `Sprint 5.1 leak ${stamp}`,
      description: 'Integration fixture for the repair job flow.',
      status: REQUEST_STATUS.PENDING,
    });
    ids.requests.push(request._id);

    const quotation = await Quotation.create({
      requestId: request._id,
      customerId: customer._id,
      contractorId: contractor._id,
      items: [{ type: QUOTE_ITEM_TYPE.LABOR, name: 'Pipe repair', quantity: 1, unit: 'JOB', price: 500000 }],
      materialCost: 0,
      laborCost: 500000,
      transportCost: 0,
      totalCost: 500000,
      estimatedDays: 1,
      status: QUOTATION_STATUS.SENT,
    });
    ids.quotations.push(quotation._id);

    const first = await customerAction(quotation._id, customer._id, 'accept');
    assert.equal(first.quotation.status, QUOTATION_STATUS.ACCEPTED);
    assert.ok(first.order?.id);
    assert.equal(first.order.status, 'QUOTATION_ACCEPTED');
    assert.equal(first.payment.status, 'UNPAID');
    assert.equal(first.notification.type, NOTIFICATION_TYPE.ORDER_CREATED);
    ids.orders.push(first.order.id);
    ids.payments.push(first.payment.id);

    const quoteDoc = await Quotation.findById(quotation._id);
    assert.equal(quoteDoc.status, QUOTATION_STATUS.ACCEPTED);
    const orderCount = await Order.countDocuments({ quotationId: quotation._id });
    assert.equal(orderCount, 1);

    const progressed = await progressService.addProgress(first.order.id, {
      id: contractor._id,
      role: ROLES.CONTRACTOR,
    }, {
      status: 'STARTED',
      description: 'Opened the wet wall and started pipe replacement.',
      images: [],
    });
    ids.progress.push(progressed.progress.id);
    assert.equal(progressed.progress.status, 'STARTED');
    assert.equal(progressed.order.status, 'STARTED');
    assert.equal(progressed.notification.type, NOTIFICATION_TYPE.CONTRACTOR_ACCEPTED_JOB);
    const history = await ProgressUpdate.countDocuments({ orderId: first.order.id });
    assert.equal(history, 1);

    const second = await customerAction(quotation._id, customer._id, 'accept');
    assert.equal(String(second.order.id), String(first.order.id));
    assert.equal(await Order.countDocuments({ quotationId: quotation._id }), 1);
    assert.equal(await Payment.countDocuments({ orderId: first.order.id }), 1);

    const notifyCount = await Notification.countDocuments({
      userId: contractor._id,
      type: NOTIFICATION_TYPE.ORDER_CREATED,
      'meta.quotationId': String(quotation._id),
    });
    assert.equal(notifyCount, 1);
  });
});
