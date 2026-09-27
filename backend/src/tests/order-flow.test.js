const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let mongoose;
let connectDatabase;
let dbReady = false;
let skipReason = '';

try {
  ({ connectDatabase } = require('../config/database'));
  mongoose = require('mongoose');
} catch (err) {
  skipReason = err.message;
}

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
    if (!connectDatabase) return;
    try {
      await connectDatabase();
      dbReady = true;
    } catch (err) {
      skipReason = err.message;
    }
  });

  after(async () => {
    if (!dbReady) return;
    const { User } = require('../models/User');
    const { RepairRequest } = require('../models/RepairRequest');
    const { Quotation } = require('../models/Quotation');
    const { Order } = require('../models/Order');
    const { Payment } = require('../models/Payment');
    const { ProgressUpdate } = require('../models/ProgressUpdate');
    const { Notification } = require('../models/Notification');

    await Promise.all([
      User.deleteMany({ _id: { $in: ids.users } }),
      RepairRequest.deleteMany({ _id: { $in: ids.requests } }),
      Quotation.deleteMany({ _id: { $in: ids.quotations } }),
      Order.deleteMany({ _id: { $in: ids.orders } }),
      Payment.deleteMany({ _id: { $in: ids.payments } }),
      ProgressUpdate.deleteMany({ _id: { $in: ids.progress } }),
      Notification.deleteMany({ userId: { $in: ids.users } }),
    ]);
    const { stopMongo } = require('./helpers/mongo');
    await stopMongo();
  });

  it('accepts a quotation once, lets the contractor record progress, and blocks a duplicate order', async (t) => {
    if (!dbReady) {
      t.skip(skipReason || 'MongoDB is not available');
      return;
    }

    const { User, ROLES, USER_STATUS } = require('../models/User');
    const { RepairRequest, REPAIR_CATEGORY, REQUEST_STATUS } = require('../models/RepairRequest');
    const { Quotation, QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../models/Quotation');
    const { Order } = require('../models/Order');
    const { Payment } = require('../models/Payment');
    const { ProgressUpdate } = require('../models/ProgressUpdate');
    const { Notification, NOTIFICATION_TYPE } = require('../models/Notification');
    const { customerAction } = require('../services/quotation.service');
    const progressService = require('../services/progress.service');

    const stamp = Date.now();
    const customer = await User.create({
      name: 'Sprint51 Customer',
      email: `s51.customer.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CUSTOMER,
      status: USER_STATUS.ACTIVE,
    });
    const contractor = await User.create({
      name: 'Sprint51 Contractor',
      email: `s51.contractor.${stamp}@buildmate.test`,
      password: 'Demo@1234',
      role: ROLES.CONTRACTOR,
      status: USER_STATUS.ACTIVE,
    });
    ids.users.push(customer._id, contractor._id);

    const request = await RepairRequest.create({
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
