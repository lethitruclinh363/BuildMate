/**
 * PostgreSQL cutover smoke. Does not print passwords, URIs, or tokens.
 * MongoDB is opened read-only to confirm collection counts stay unchanged.
 */
process.env.DATABASE_PROVIDER = 'postgres';

const { connectDatabase, disconnectDatabase } = require('../../src/config/database');
const { connectMongo, closeConnections } = require('./lib/connections');
const { prisma } = require('../../src/config/prisma');
const { userRepository } = require('../../src/repositories/userRepository');
const authService = require('../../src/services/authService');
const userService = require('../../src/services/userService');
const locationService = require('../../src/services/locationService');
const repairService = require('../../src/services/repairService');
const quotationService = require('../../src/services/quotationService');
const chatService = require('../../src/services/chatService');
const orderService = require('../../src/services/orderService');
const paymentService = require('../../src/services/paymentService');
const progressService = require('../../src/services/progressService');
const reviewService = require('../../src/services/reviewService');
const complaintService = require('../../src/services/complaintService');
const policyService = require('../../src/services/policy.service');
const adminService = require('../../src/services/adminService');
const analyticsService = require('../../src/services/analyticsService');
const { writeAudit, listAudit, AUDIT_ACTION } = require('../../src/services/auditService');
const { notify, listForUser, NOTIFICATION_TYPE } = require('../../src/services/notificationService');
const contractorEkycService = require('../../src/services/contractorEkycService');
const { ContractorEkycVerification } = require('../../src/repositories/ekycAccess');
const locationCorrection = require('../../src/services/locationCorrection.service');

const stamp = String(Date.now()).slice(-8);
const results = [];
const MONGO = [
  'users', 'orders', 'payments', 'notifications', 'policies', 'policyrevisions', 'auditlogs',
  'materialOrders', 'materialOrderPayments', 'materialCommissions', 'locationcorrections',
  'contractorekycverifications', 'stores', 'services', 'materials', 'repairrequests',
  'chatrooms', 'messages', 'quotations', 'reviews', 'complaints', 'progressupdates',
];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail || '' });
  console.log(`RESULT ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, work) {
  try {
    const detail = await work();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error.message);
  }
}

async function mongoCounts(mongo) {
  const names = new Set((await mongo.db.listCollections().toArray()).map((item) => item.name));
  const counts = {};
  for (const name of MONGO) {
    counts[name] = names.has(name) ? await mongo.db.collection(name).countDocuments() : 0;
  }
  return counts;
}

async function integrity() {
  const legacyTables = (await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'legacy_mongo_id'
  `).map((row) => row.table_name);
  let duplicateLegacy = 0;
  for (const table of legacyTables) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT legacy_mongo_id FROM public.${table}
         WHERE legacy_mongo_id IS NOT NULL
         GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
       ) d`
    );
    duplicateLegacy += Number(rows[0].count);
  }
  const invalidRole = Number((await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE r.code IS NULL OR r.code NOT IN ('ADMIN', 'CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER')
  `)[0].count);
  const invalidFk = Number((await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND NOT convalidated
  `)[0].count);
  const money = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM material_orders
    WHERE material_subtotal + shipping_fee <> total_amount
       OR deposit_amount + remaining_amount <> total_amount
       OR platform_fee_amount + store_deposit_amount <> deposit_amount
  `;
  return {
    duplicateLegacy,
    invalidRole,
    invalidFk,
    monetary: Number(money[0].count),
  };
}

async function main() {
  const original = console.log;
  console.log = (...args) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ');
    if (text.startsWith('RESULT ') || text.startsWith('[db]')) original(...args);
  };
  await connectDatabase();
  const mongo = await connectMongo();
  const before = await mongoCounts(mongo);

  const password = 'AuthPg1a';
  const email = `cutover.customer.${stamp}@example.com`;
  const phone = `06${stamp}`;

  await step('auth register', async () => {
    const created = await authService.register({
      fullName: 'Cutover Customer',
      email,
      password,
      phoneNumber: phone,
      role: 'CUSTOMER',
      acceptedPolicy: true,
      policyLanguage: 'vi',
    });
    const row = await prisma.users.findFirst({ where: { email } });
    if (!row || row.account_status !== 'PENDING_EMAIL') throw new Error('register did not write PostgreSQL');
    return created.emailSent ? 'otp email attempted' : 'otp stored';
  });

  const customer = await userRepository.create({
    fullName: 'Cutover Login',
    email: `cutover.login.${stamp}@example.com`,
    password,
    phoneNumber: `07${stamp}`,
    role: 'CUSTOMER',
    acceptedPolicy: true,
    profileStatus: 'INCOMPLETE',
    status: 'ACTIVE',
    emailVerified: true,
  });
  const customerUser = { id: customer._id, role: 'CUSTOMER' };

  await step('auth login', async () => {
    const session = await authService.login({ email: customer.email, password });
    if (!session.token && !session.accessToken && !session.user) throw new Error('login returned no session');
    return 'session issued';
  });

  await step('auth reset password request', async () => {
    await authService.forgotPassword({ email: customer.email });
    const row = await prisma.users.findFirst({
      where: { legacy_mongo_id: customer._id },
      select: { reset_password_token: true },
    });
    if (!row?.reset_password_token) throw new Error('reset token was not stored');
    return 'token stored';
  });

  await step('customer profile', async () => {
    const updated = await userService.updateProfile(customer._id, { fullName: 'Cutover Profile' }, customerUser);
    return updated.fullName || updated.name || 'updated';
  });

  await step('search providers', async () => {
    const rows = await locationService.nearbyContractors({ lat: 10.045, lng: 105.746, radiusKm: 50 });
    return `${rows.length} contractors`;
  });

  await step('search stores', async () => {
    const rows = await locationService.nearbyStores({ lat: 10.045, lng: 105.746, radiusKm: 50 });
    return `${rows.length} stores`;
  });

  const serviceStore = await prisma.stores.findFirst({
    where: { status: 'LIVE', store_type: 'SERVICES' },
    include: { users: { select: { legacy_mongo_id: true } } },
    orderBy: { id: 'desc' },
  });

  if (!serviceStore) {
    record('repair quotation order payment progress review complaint', false, 'no live service store');
  } else {
    const contractorId = serviceStore.users.legacy_mongo_id;
    const contractor = { id: contractorId, role: 'CONTRACTOR' };
    await step('customer repair request', async () => {
      const request = await repairService.createRequest(customer._id, {
        contractorId,
        storeId: serviceStore.legacy_mongo_id,
        catalogServiceId: 'Electrical::Wiring',
        title: `Cutover job ${stamp}`,
        description: 'Ceiling leak above the kitchen',
        images: ['/uploads/cutover-a.jpg'],
        address: '15 Nguyen Van Cu, Can Tho',
        lat: 10.045,
        lng: 105.787,
        locationConfirmed: true,
        locationSource: 'GPS',
      });
      global.requestId = request.id;
      return request.status;
    });
    await step('chat message', async () => {
      const rooms = await chatService.listRooms(customer._id, 'CUSTOMER');
      const room = rooms.find((item) => String(item.request?.id || item.requestId) === String(global.requestId));
      if (!room) throw new Error('chat room was not created');
      const message = await chatService.sendMessage({
        roomId: room.id,
        senderId: customer._id,
        content: 'Cutover hello',
      });
      return message.type || 'sent';
    });
    await step('quotation order payment progress review complaint', async () => {
      await repairService.setStatus(global.requestId, contractorId, 'ACCEPTED');
      const quote = await quotationService.createQuotation(contractorId, {
        requestId: global.requestId,
        transportCost: 20000,
        estimatedDays: 2,
        note: 'Cutover quote',
        items: [
          { type: 'MATERIAL', name: 'Sealant', quantity: 2, unit: 'tube', price: 40000 },
          { type: 'LABOR', name: 'Repair labor', quantity: 1, unit: 'job', price: 150000 },
        ],
      });
      const accepted = await quotationService.customerAction(quote.id, customer._id, 'accept');
      const order = await prisma.service_orders.findFirst({ where: { legacy_mongo_id: accepted.order.id }, include: { payments: true } });
      if (!order || order.payments.length !== 1) throw new Error('service order was not written');
      const deposit = order.payments[0];
      await paymentService.checkout(deposit.legacy_mongo_id, customerUser, { method: 'MOCK' });
      await paymentService.mockSuccess(deposit.legacy_mongo_id, customerUser);
      await progressService.addProgress(accepted.order.id, contractor, {
        status: 'STARTED', description: 'Crew is on site', images: [], lat: 10.045, lng: 105.787,
      });
      await progressService.addProgress(accepted.order.id, contractor, {
        status: 'IN_PROGRESS', description: 'Opening the ceiling', images: [],
      });
      await progressService.addProgress(accepted.order.id, contractor, {
        status: 'COMPLETED', description: 'Leak is sealed', images: [],
      });
      await orderService.completeOrder(accepted.order.id, customer._id);
      await reviewService.createReview(customer._id, {
        orderId: accepted.order.id,
        targetUserId: contractorId,
        targetType: 'CONTRACTOR',
        rating: 5,
        comment: 'Cutover review',
        images: [],
      });
      const complaint = await complaintService.createComplaint(customerUser, {
        orderId: accepted.order.id,
        againstUser: contractorId,
        reason: 'Follow-up needed',
        description: 'Need a follow-up visit next week',
      });
      return complaint.status || 'filed';
    });
  }

  await step('historical material order tables remain', async () => {
    const count = await prisma.material_orders.count();
    return `historical ${count}`;
  });

  await step('location correction memory', async () => {
    const saved = await locationCorrection.record({
      address: `Cutover lane ${stamp}, Can Tho`,
      lat: 10.0452,
      lng: 105.7462,
      refId: `ref-${stamp}`,
    });
    if (!saved) throw new Error('correction was not stored');
    const row = await prisma.location_corrections.findFirst({ where: { legacy_mongo_id: String(saved._id || saved.id) } });
    if (!row) throw new Error('correction is not in PostgreSQL');
    return `count ${row.confirmed_count}`;
  });

  await step('policies', async () => {
    const rows = await policyService.listPolicies({ language: 'vi' });
    if (!rows.length) throw new Error('no policies');
    return `${rows.length} policies`;
  });

  const admin = await prisma.users.findFirst({
    where: { roles: { code: 'ADMIN' }, legacy_mongo_id: { not: null } },
    select: { legacy_mongo_id: true },
  });

  await step('admin users and analytics', async () => {
    const customers = await adminService.listCustomers();
    const stats = await analyticsService.getAnalytics();
    if (!customers.some((row) => String(row.id) === String(customer._id))) throw new Error('new customer is missing');
    return stats ? 'overview' : `${customers.length} customers`;
  });

  await step('audit log', async () => {
    await writeAudit({
      actorId: admin?.legacy_mongo_id || customer._id,
      actorRole: 'ADMIN',
      action: AUDIT_ACTION.POLICY_UPDATED,
      entityType: 'Policy',
      entityId: 'cutover',
      meta: { stamp },
    });
    const rows = await listAudit({ action: AUDIT_ACTION.POLICY_UPDATED, limit: 5 });
    if (!rows.some((row) => row.meta?.stamp === stamp || row.entityId === 'cutover')) throw new Error('audit row missing');
    return 'written';
  });

  await step('notification', async () => {
    await notify({
      userId: customer._id,
      title: 'Cutover notice',
      message: 'PostgreSQL notification',
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link: '/account',
      meta: { stamp },
    });
    const rows = await listForUser(customer._id, { limit: 5 });
    const list = rows.items || rows;
    if (!list.some((row) => row.title === 'Cutover notice')) throw new Error('notification missing');
    const row = await prisma.notifications.findFirst({ where: { user_id: (await prisma.users.findFirst({ where: { legacy_mongo_id: customer._id } })).id, title: 'Cutover notice' } });
    if (!row) throw new Error('notification is not in PostgreSQL');
    return 'stored';
  });

  await step('ekyc persistence and admin review', async () => {
    const used = await prisma.contractor_ekyc_verifications.findMany({ select: { contractor_profile_id: true } });
    const usedIds = used.map((row) => row.contractor_profile_id);
    let profile = await prisma.contractor_profiles.findFirst({
      where: usedIds.length ? { id: { notIn: usedIds } } : {},
      include: { users_contractor_profiles_user_idTousers: { select: { legacy_mongo_id: true } } },
    });
    if (!profile) {
      const owner = await userRepository.create({
        fullName: 'Cutover eKYC',
        email: `cutover.ekyc.${stamp}@example.com`,
        password,
        phoneNumber: `09${stamp}`,
        role: 'CONTRACTOR',
        acceptedPolicy: true,
        profileStatus: 'INCOMPLETE',
        status: 'ACTIVE',
        emailVerified: true,
      });
      const { ContractorProfile } = require('../../src/repositories/partnerAccess');
      await ContractorProfile.create({
        userId: owner._id,
        businessName: 'Cutover eKYC',
        verificationStatus: 'APPROVED',
      });
      profile = await prisma.contractor_profiles.findFirst({
        where: { users_contractor_profiles_user_idTousers: { legacy_mongo_id: owner._id } },
        include: { users_contractor_profiles_user_idTousers: { select: { legacy_mongo_id: true } } },
      });
    }
    const ownerId = profile?.users_contractor_profiles_user_idTousers?.legacy_mongo_id;
    if (!profile?.legacy_mongo_id || !ownerId) throw new Error('no contractor profile without eKYC');
    const record = await ContractorEkycVerification.create({
      userId: ownerId,
      contractorId: profile.legacy_mongo_id,
      status: 'AI_PASSED',
      cardImages: { front: '/private/front.jpg', back: '/private/back.jpg' },
      ocr: { idNumber: '079000000000', fullName: 'Cutover', dateOfBirth: '1990-01-01', gender: '', hometown: '', passed: true, issues: ['glare'] },
      liveness: { passed: true, centerImage: '/private/center.jpg', leftImage: '', rightImage: '', upImage: '', downImage: '' },
      faceMatch: { decision: 'MATCH', matched: true, distance: 0.1, threshold: 0.3 },
    });
    const submitted = await contractorEkycService.submit(ownerId, { verificationStatus: 'DRAFT' });
    const reviewed = await contractorEkycService.recordAdminDecision(ownerId, admin?.legacy_mongo_id, 'APPROVE', 'cutover');
    const stored = await prisma.contractor_ekyc_verifications.findFirst({
      where: { legacy_mongo_id: record._id },
      include: { ekyc_ocr_issues: true, ekyc_liveness_frames: true },
    });
    if (submitted.status !== 'SUBMITTED' || reviewed.adminReview?.decision !== 'APPROVE') throw new Error('review was not saved');
    if (!stored || stored.ekyc_ocr_issues.length !== 1 || stored.ekyc_liveness_frames.length !== 1) throw new Error('ocr or liveness child rows missing');
    return 'submit and review stored; FastAPI was not called';
  });

  const checks = await integrity();
  record('foreign keys valid', checks.invalidFk === 0, `not valid ${checks.invalidFk}`);
  record('duplicate legacy ids', checks.duplicateLegacy === 0, String(checks.duplicateLegacy));
  record('invalid roles', checks.invalidRole === 0, String(checks.invalidRole));
  record('monetary consistency', checks.monetary === 0, String(checks.monetary));

  const after = await mongoCounts(mongo);
  const changed = MONGO.filter((name) => before[name] !== after[name]);
  record('mongo counts unchanged', changed.length === 0, changed.join(',') || 'unchanged');

  const failed = results.filter((item) => !item.pass);
  original(`SUMMARY ${results.length - failed.length}/${results.length}`);
  await closeConnections(null);
  await disconnectDatabase();
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error.message);
  process.exit(1);
});
