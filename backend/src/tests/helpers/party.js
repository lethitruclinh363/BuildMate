const { User, ROLES, USER_STATUS } = require('../../models/User');
const { RepairRequest, REPAIR_CATEGORY, REQUEST_STATUS } = require('../../models/RepairRequest');
const { Quotation, QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../../models/Quotation');
const { signToken } = require('../../services/authService');

async function createParty(stamp = Date.now()) {
  const customer = await User.create({
    name: 'E2E Customer',
    email: `e2e.customer.${stamp}@buildmate.test`,
    password: 'Demo@1234',
    role: ROLES.CUSTOMER,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  const contractor = await User.create({
    name: 'E2E Contractor',
    email: `e2e.contractor.${stamp}@buildmate.test`,
    password: 'Demo@1234',
    role: ROLES.CONTRACTOR,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  const stranger = await User.create({
    name: 'E2E Stranger',
    email: `e2e.stranger.${stamp}@buildmate.test`,
    password: 'Demo@1234',
    role: ROLES.CUSTOMER,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });

  const request = await RepairRequest.create({
    customerId: customer._id,
    contractorId: contractor._id,
    category: REPAIR_CATEGORY.PLUMBING,
    title: `E2E leak ${stamp}`,
    description: 'Sprint 5.3 fixture request for the locked quotation-to-order flow.',
    address: '12 Nguyen Van Cu, Ninh Kieu',
    status: REQUEST_STATUS.PENDING,
  });

  const quotation = await Quotation.create({
    requestId: request._id,
    customerId: customer._id,
    contractorId: contractor._id,
    items: [{ type: QUOTE_ITEM_TYPE.LABOR, name: 'Pipe repair', quantity: 1, unit: 'JOB', price: 750000 }],
    materialCost: 0,
    laborCost: 750000,
    transportCost: 0,
    totalCost: 750000,
    estimatedDays: 1,
    status: QUOTATION_STATUS.SENT,
  });

  return {
    customer,
    contractor,
    stranger,
    request,
    quotation,
    tokens: {
      customer: signToken(customer),
      contractor: signToken(contractor),
      stranger: signToken(stranger),
    },
    ids: [customer._id, contractor._id, stranger._id],
  };
}

async function cleanupParty(party) {
  if (!party) return;
  const { Order } = require('../../models/Order');
  const { Payment } = require('../../models/Payment');
  const { ProgressUpdate } = require('../../models/ProgressUpdate');
  const { Notification } = require('../../models/Notification');
  const { Quotation } = require('../../models/Quotation');
  const { RepairRequest } = require('../../models/RepairRequest');
  const { User } = require('../../models/User');

  const order = await Order.findOne({ quotationId: party.quotation._id });
  const { Commission } = require('../../models/Commission');
  const { Review } = require('../../models/Review');
  const { Complaint } = require('../../models/Complaint');
  await Promise.all([
    order ? Payment.deleteMany({ orderId: order._id }) : null,
    order ? Commission.deleteMany({ orderId: order._id }) : null,
    order ? Review.deleteMany({ orderId: order._id }) : null,
    order ? Complaint.deleteMany({ orderId: order._id }) : null,
    order ? ProgressUpdate.deleteMany({ orderId: order._id }) : null,
    order ? Order.deleteOne({ _id: order._id }) : null,
    Notification.deleteMany({ userId: { $in: party.ids } }),
    Quotation.deleteOne({ _id: party.quotation._id }),
    RepairRequest.deleteOne({ _id: party.request._id }),
    User.deleteMany({ _id: { $in: party.ids } }),
  ]);
}

module.exports = { createParty, cleanupParty };
