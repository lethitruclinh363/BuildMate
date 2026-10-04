const { User } = require('../models/User');
const { RepairRequest, REPAIR_CATEGORY, REQUEST_STATUS } = require('../models/RepairRequest');
const { Quotation, QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../models/Quotation');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { Payment, PAYMENT_TYPE } = require('../models/Payment');
const { Commission } = require('../models/Commission');
const { Review } = require('../models/Review');
const { Complaint, COMPLAINT_STATUS } = require('../models/Complaint');
const { Store } = require('../models/Store');
const orderService = require('../services/orderService');
const commissionService = require('../services/commissionService');
const reviewService = require('../services/reviewService');

async function backfillPayments() {
  const rows = await Payment.find({ $or: [{ customerId: { $exists: false } }, { customerId: null }] });
  for (const payment of rows) {
    const order = await Order.findById(payment.orderId);
    if (!order) continue;
    payment.customerId = order.customerId;
    payment.contractorId = order.contractorId;
    payment.type = payment.type || PAYMENT_TYPE.FULL_PAYMENT;
    payment.provider = payment.provider || 'mock';
    payment.metadata = payment.metadata || {};
    await payment.save();
  }
}

async function seedSprint61() {
  await commissionService.getActiveRule();
  await backfillPayments();

  const customer = await User.findOne({ email: 'oscar.d@example.net' });
  const contractor = await User.findOne({ email: 'paula.r@example.org' });
  if (!customer || !contractor) {
    console.warn('[seed] Sprint 6.1 skipped — demo users missing');
    return;
  }

  let request = await RepairRequest.findOne({ title: 'Sprint 6.1 paid waterproofing demo' });
  if (!request) {
    request = await RepairRequest.create({
      customerId: customer._id,
      contractorId: contractor._id,
      category: REPAIR_CATEGORY.WATERPROOF,
      title: 'Sprint 6.1 paid waterproofing demo',
      description: 'Seeded completed job used for payment, commission, review, and complaint examples.',
      address: '12 Nguyen Van Cu, Ninh Kieu',
      status: REQUEST_STATUS.ACCEPTED,
    });
  }

  let quotation = await Quotation.findOne({ requestId: request._id });
  if (!quotation) {
    quotation = await Quotation.create({
      requestId: request._id,
      customerId: customer._id,
      contractorId: contractor._id,
      items: [{ type: QUOTE_ITEM_TYPE.LABOR, name: 'Waterproof membrane', quantity: 1, unit: 'JOB', price: 5000000 }],
      laborCost: 5000000,
      materialCost: 0,
      transportCost: 0,
      totalCost: 5000000,
      estimatedDays: 2,
      status: QUOTATION_STATUS.SENT,
    });
  }

  let bundle = await orderService.getBundleByQuotation(quotation._id);
  if (!bundle.order) {
    quotation.status = QUOTATION_STATUS.SENT;
    await quotation.save();
    bundle = await orderService.createFromQuotation(quotation, request, customer._id);
  }

  const order = await Order.findById(bundle.order.id);
  order.status = ORDER_STATUS.CUSTOMER_ACCEPTED;
  order.completedAt = new Date();
  await order.save();
  await RepairRequest.findByIdAndUpdate(request._id, { status: REQUEST_STATUS.COMPLETED });

  const payment = await Payment.findOne({ orderId: order._id });
  if (payment && payment.status !== PAYMENT_STATUS.PAID) {
    payment.status = PAYMENT_STATUS.PENDING;
    payment.transactionCode = payment.transactionCode || 'BM-PAY-SEED61';
    payment.amount = 5000000;
    await payment.save();
    await require('../services/paymentService').markPaid(payment, customer._id, 'CUSTOMER');
  }

  const commission = await Commission.findOne({ orderId: order._id });
  const existingReview = await Review.findOne({ orderId: order._id, targetUserId: contractor._id });
  if (!existingReview) {
    await reviewService.createReview(customer._id, {
      orderId: String(order._id),
      targetUserId: String(contractor._id),
      rating: 5,
      comment: 'An Phu hoàn thành sạch sẽ, đúng tiến độ.',
    });
  }

  const existingComplaint = await Complaint.findOne({ orderId: order._id });
  if (!existingComplaint) {
    await Complaint.create({
      orderId: order._id,
      createdBy: customer._id,
      againstUser: contractor._id,
      reason: 'DELAY',
      description: 'Seeded example complaint for the admin queue. Not a live dispute.',
      status: COMPLAINT_STATUS.OPEN,
    });
  }

  const store = await Store.findOne({ contractorId: contractor._id });
  console.log(
    '[seed] Sprint 6.1',
    order.orderCode,
    payment?.status || 'no-payment',
    'commission',
    commission ? 'yes' : 'pending-markPaid',
    'storeRating',
    store?.rating
  );
}

module.exports = { seedSprint61, backfillPayments };
