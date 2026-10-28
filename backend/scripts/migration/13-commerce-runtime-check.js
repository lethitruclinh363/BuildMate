/**
 * Service order, payment, commission, progress, review, and complaint runtime check.
 * Does not print passwords or connection strings.
 */
process.env.DATABASE_PROVIDER = 'postgres';

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const { prisma } = require('../../src/config/prisma');
const { userRepository } = require('../../src/repositories/userRepository');
const { Payment, runInTransaction } = require('../../src/repositories/commerceAccess');
const repairService = require('../../src/services/repairService');
const quotationService = require('../../src/services/quotationService');
const orderService = require('../../src/services/orderService');
const paymentService = require('../../src/services/paymentService');
const progressService = require('../../src/services/progressService');
const reviewService = require('../../src/services/reviewService');
const complaintService = require('../../src/services/complaintService');
const commissionService = require('../../src/services/commissionService');

const stamp = String(Date.now()).slice(-8);
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

async function mongoCounts() {
  const db = mongoose.connection.db;
  const names = ['orders', 'payments', 'commissionrules', 'commissions', 'progressupdates', 'reviews', 'complaints'];
  const counts = {};
  for (const name of names) counts[name] = await db.collection(name).countDocuments();
  return counts;
}

async function main() {
  const original = console.log;
  console.log = (...args) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ');
    if (text.startsWith('RESULT ') || text.startsWith('[db]')) original(...args);
  };

  await connectDatabase();
  const before = await mongoCounts();
  const store = await prisma.stores.findFirst({
    where: { status: 'LIVE', store_type: 'SERVICES' },
    include: { users: { select: { legacy_mongo_id: true } } },
    orderBy: { id: 'desc' },
  });
  if (!store) throw new Error('No live service store is available');
  const contractorId = store.users.legacy_mongo_id;
  const contractor = { id: contractorId, role: 'CONTRACTOR' };
  const admin = await prisma.users.findFirst({
    where: { roles: { code: 'ADMIN' }, legacy_mongo_id: { not: null } },
    select: { legacy_mongo_id: true },
  });
  if (!admin) throw new Error('No admin is available');

  const customer = await userRepository.create({
    fullName: 'Commerce Customer',
    email: `commerce.customer.${stamp}@example.com`,
    password: 'AuthPg1a',
    phoneNumber: `07${stamp}`,
    role: 'CUSTOMER',
    acceptedPolicy: true,
    profileStatus: 'INCOMPLETE',
    status: 'ACTIVE',
    emailVerified: true,
  });
  const customerUser = { id: customer._id, role: 'CUSTOMER' };

  const request = await repairService.createRequest(customer._id, {
    contractorId,
    storeId: store.legacy_mongo_id,
    catalogServiceId: 'Electrical::Wiring',
    title: `Commerce job ${stamp}`,
    description: 'Ceiling leak above the kitchen',
    images: ['/uploads/commerce-a.jpg'],
    address: '15 Nguyen Van Cu, Can Tho',
    lat: 10.045,
    lng: 105.787,
    locationConfirmed: true,
    locationSource: 'GPS',
  });
  await repairService.setStatus(request.id, contractorId, 'ACCEPTED');
  const quote = await quotationService.createQuotation(contractorId, {
    requestId: request.id,
    transportCost: 20000,
    estimatedDays: 2,
    note: 'Commerce runtime quote',
    items: [
      { type: 'MATERIAL', name: 'Sealant', quantity: 2, unit: 'tube', price: 40000 },
      { type: 'LABOR', name: 'Repair labor', quantity: 1, unit: 'job', price: 150000 },
    ],
  });
  const accepted = await quotationService.customerAction(quote.id, customer._id, 'accept');
  const orderRow = await prisma.service_orders.findFirst({
    where: { legacy_mongo_id: accepted.order.id },
    include: { payments: true },
  });
  const mongoOrder = await mongoose.connection.db.collection('orders').countDocuments({
    _id: new mongoose.Types.ObjectId(accepted.order.id),
  });
  record(
    'accept creates postgres service order',
    accepted.order.orderCode && Number(orderRow.amount) === 250000 && orderRow.payments.length === 1 && orderRow.payments[0].payment_type === 'FULL_PAYMENT' && mongoOrder === 0 && orderRow.status === 'QUOTATION_ACCEPTED',
    accepted.order.status
  );

  const rule = await commissionService.getActiveRule();
  const deposit = await Payment.create({
    orderId: accepted.order.id,
    customerId: customer._id,
    contractorId,
    amount: 100000,
    type: 'DEPOSIT',
    status: 'UNPAID',
    provider: 'mock',
    metadata: {},
  });
  const checkout = await paymentService.checkout(deposit._id, customerUser, { method: 'MOCK' });
  const paid = await paymentService.mockSuccess(deposit._id, customerUser);
  const paidRow = await prisma.payments.findFirst({
    where: { legacy_mongo_id: deposit._id },
    include: { commissions: true, service_orders: true },
  });
  const commission = paidRow.commissions;
  const expectedPlatform = Math.round((100000 * Number(rule.percentage)) / 100);
  const parts = cents(commission.platform_amount) + cents(commission.contractor_amount);
  record(
    'deposit payment posts commission',
    checkout.payment.status === 'PENDING'
      && paid.payment.status === 'PAID'
      && paidRow.transaction_code === checkout.payment.transactionCode
      && cents(paidRow.amount) === 10000000
      && paidRow.service_orders.status === 'DEPOSIT_PAID'
      && paidRow.service_orders.payment_status === 'UNPAID'
      && commission.status === 'POSTED'
      && cents(commission.platform_amount) === expectedPlatform * 100
      && parts === 10000000
      && Number(commission.rate_snapshot) === Number(rule.percentage),
    `rate ${rule.percentage}`
  );

  const rulesBefore = await prisma.commission_rules.count();
  let rolledBack = false;
  try {
    await runInTransaction(async (tx) => {
      await tx.service_orders.update({
        where: { id: orderRow.id },
        data: { title: 'should rollback' },
      });
      throw new Error('force rollback');
    });
  } catch (error) {
    rolledBack = error.message === 'force rollback';
  }
  const titleAfter = await prisma.service_orders.findUnique({ where: { id: orderRow.id }, select: { title: true } });
  const rulesAfter = await prisma.commission_rules.count();
  record(
    'postgres transaction rolls back',
    rolledBack && titleAfter.title !== 'should rollback' && rulesBefore === rulesAfter,
    titleAfter.title
  );

  const started = await progressService.addProgress(accepted.order.id, contractor, {
    status: 'STARTED',
    description: 'Crew is on site',
    images: ['/uploads/progress-start.jpg'],
    lat: 10.045,
    lng: 105.787,
  });
  const working = await progressService.addProgress(accepted.order.id, contractor, {
    status: 'IN_PROGRESS',
    description: 'Opening the ceiling',
    images: ['/uploads/progress-work.jpg'],
  });
  const finished = await progressService.addProgress(accepted.order.id, contractor, {
    status: 'COMPLETED',
    description: 'Leak is sealed',
    images: [],
  });
  const progressRows = await prisma.progress_updates.findMany({
    where: { service_orders: { legacy_mongo_id: accepted.order.id } },
    include: { progress_media: true, locations: true },
    orderBy: { created_at: 'asc' },
  });
  record(
    'contractor progress through completion',
    started.order.status === 'STARTED'
      && working.order.status === 'IN_PROGRESS'
      && finished.order.status === 'COMPLETED'
      && progressRows.length === 3
      && progressRows[0].progress_media.length === 1
      && progressRows[0].locations?.latitude != null,
    finished.order.status
  );

  const handed = await orderService.completeOrder(accepted.order.id, customer._id);
  const viewed = await orderService.getOrder(accepted.order.id, customerUser);
  record(
    'customer accepts completed order',
    handed.order.status === 'CUSTOMER_ACCEPTED' && viewed.status === 'CUSTOMER_ACCEPTED' && viewed.orderCode === accepted.order.orderCode,
    handed.order.status
  );

  const review = await reviewService.createReview(customer._id, {
    orderId: accepted.order.id,
    targetUserId: contractorId,
    targetType: 'CONTRACTOR',
    rating: 5,
    comment: 'Careful and on time',
    images: ['/uploads/review.jpg'],
  });
  const replied = await reviewService.replyToReview(contractorId, review.id, 'Thank you');
  const reviewRow = await prisma.reviews.findFirst({
    where: { legacy_mongo_id: review.id },
    include: { review_media: true },
  });
  const listed = await reviewService.listForUser(contractorId, 'CONTRACTOR');
  record(
    'customer review and contractor reply',
    review.rating === 5
      && replied.contractorReply === 'Thank you'
      && reviewRow.review_media.length === 1
      && listed.items.some((item) => item.id === review.id && item.rating === 5),
    String(review.rating)
  );

  const complaint = await complaintService.createComplaint(customerUser, {
    orderId: accepted.order.id,
    againstUser: contractorId,
    reason: 'Schedule change',
    description: 'The start date moved without notice',
    attachments: ['/uploads/complaint.jpg'],
  });
  const processing = await complaintService.adminUpdate(complaint.id, admin.legacy_mongo_id, {
    status: 'PROCESSING',
    adminNote: 'Checking the schedule',
  });
  const resolved = await complaintService.adminUpdate(complaint.id, admin.legacy_mongo_id, {
    status: 'RESOLVED',
    adminNote: 'Contractor will return tomorrow morning',
  });
  const complaintRow = await prisma.complaints.findFirst({
    where: { legacy_mongo_id: complaint.id },
    include: { complaint_attachments: true },
  });
  const mine = await complaintService.listMine(customer._id);
  record(
    'complaint opens then resolves',
    complaint.status === 'OPEN'
      && processing.status === 'PROCESSING'
      && resolved.status === 'RESOLVED'
      && complaintRow.complaint_attachments.length === 1
      && complaintRow.admin_note === 'Contractor will return tomorrow morning'
      && mine.some((item) => item.id === complaint.id),
    resolved.status
  );

  const after = await mongoCounts();
  const freshInMongo = await mongoose.connection.db.collection('orders').countDocuments({
    _id: new mongoose.Types.ObjectId(accepted.order.id),
  });
  record(
    'mongo commerce collections unchanged',
    JSON.stringify(before) === JSON.stringify(after) && freshInMongo === 0,
    JSON.stringify(after)
  );

  const orphans = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(*) FROM public.service_orders o LEFT JOIN public.users u ON u.id = o.customer_user_id WHERE u.id IS NULL) AS orders,
      (SELECT COUNT(*) FROM public.payments p LEFT JOIN public.service_orders o ON o.id = p.service_order_id WHERE o.id IS NULL) AS payments,
      (SELECT COUNT(*) FROM public.commissions c LEFT JOIN public.payments p ON p.id = c.payment_id WHERE p.id IS NULL) AS commissions,
      (SELECT COUNT(*) FROM public.progress_updates g LEFT JOIN public.service_orders o ON o.id = g.service_order_id WHERE o.id IS NULL) AS progress,
      (SELECT COUNT(*) FROM public.reviews r LEFT JOIN public.service_orders o ON o.id = r.service_order_id WHERE o.id IS NULL) AS reviews,
      (SELECT COUNT(*) FROM public.complaints c LEFT JOIN public.service_orders o ON o.id = c.service_order_id WHERE o.id IS NULL) AS complaints
  `;
  const orphanCount = Object.values(orphans[0]).reduce((sum, value) => sum + Number(value), 0);
  const duplicates = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM (
      SELECT legacy_mongo_id FROM public.service_orders WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.payments WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.commissions WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.reviews WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT legacy_mongo_id FROM public.complaints WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    ) d
  `;
  record(
    'commerce orphans and duplicate legacy ids',
    orphanCount === 0 && Number(duplicates[0].count) === 0,
    `orphans ${orphanCount}`
  );
}

main()
  .catch((error) => {
    record('runtime check', false, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = results.filter((item) => !item.pass).length;
    process.stdout.write(`RESULT summary pass=${results.filter((item) => item.pass).length} fail=${failed}\n`);
    await prisma.$disconnect().catch(() => {});
    await disconnectDatabase().catch(() => {});
  });
