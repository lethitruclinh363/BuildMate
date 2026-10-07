/**
 * Copy orders, payments, commissions, progress, reviews, and complaints
 * from MongoDB into the existing PostgreSQL tables.
 * Does not delete PostgreSQL rows or write MongoDB.
 */
const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');
const { prisma } = require('../../src/config/prisma');

const ORDER_STATUS = new Set(['REQUEST_CREATED', 'QUOTATION_SENT', 'QUOTATION_ACCEPTED', 'DEPOSIT_PAID', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'CUSTOMER_ACCEPTED', 'CANCELLED']);
const PAYMENT_STATUS = new Set(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']);
const PAYMENT_TYPE = new Set(['FULL_PAYMENT', 'DEPOSIT', 'FINAL_PAYMENT']);
const COMMISSION_STATUS = new Set(['POSTED', 'REVERSED']);
const PROGRESS_STATUS = new Set(['STARTED', 'IN_PROGRESS', 'COMPLETED']);
const REVIEW_TARGET = new Set(['CONTRACTOR', 'MATERIAL_STORE']);
const COMPLAINT_STATUS = new Set(['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED']);

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function idOf(value) {
  return value ? String(value) : '';
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : null;
}

function sameMoney(left, right) {
  return money(left) === money(right);
}

function pointOf(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function skip(report, bucket, mongoId, reason, extra = {}) {
  const entry = { collection: bucket, mongo_id: mongoId, reason, ...extra };
  report.skipped.push(entry);
  if (/not in PostgreSQL/.test(reason)) report.orphans.push(entry);
}

function note(report, bucket, mongoId, reason, extra = {}) {
  report.orphans.push({ collection: bucket, mongo_id: mongoId, reason, inserted_without_reference: true, ...extra });
}

async function collection(mongo, name) {
  const names = new Set((await mongo.db.listCollections().toArray()).map((item) => item.name));
  if (!names.has(name)) return [];
  return mongo.db.collection(name).find({}).toArray();
}

async function counts(pg) {
  const tables = [
    'service_orders', 'payments', 'commission_rules', 'commissions',
    'progress_updates', 'progress_media', 'reviews', 'review_media',
    'complaints', 'complaint_attachments', 'locations',
  ];
  const out = {};
  for (const table of tables) {
    out[table] = Number((await pg.query(`SELECT COUNT(*)::int AS count FROM public.${table}`)).rows[0].count);
  }
  return out;
}

function writeReport(report) {
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'commerce-backfill-report.json'), JSON.stringify(report, null, 2));
}

async function main() {
  let pg;
  const report = {
    generated_at: new Date().toISOString(),
    committed: false,
    mongo: {},
    postgres_before: {},
    inserted: {
      commission_rules: 0, service_orders: 0, payments: 0, commissions: 0,
      progress_updates: 0, reviews: 0, complaints: 0,
    },
    already_mapped: {
      commission_rules: 0, service_orders: 0, payments: 0, commissions: 0,
      progress_updates: 0, reviews: 0, complaints: 0,
    },
    skipped: [],
    orphans: [],
    collisions: [],
    active_rule_resolution: null,
    total_mismatches: [],
    postgres_after: {},
    mongo_after: {},
    mongo_writes: false,
  };

  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const rules = await collection(mongo, 'commissionrules');
    const orders = await collection(mongo, 'orders');
    const payments = await collection(mongo, 'payments');
    const commissions = await collection(mongo, 'commissions');
    const progress = await collection(mongo, 'progressupdates');
    const reviews = await collection(mongo, 'reviews');
    const complaints = await collection(mongo, 'complaints');
    const mongoBefore = {
      commissionrules: rules.length,
      orders: orders.length,
      payments: payments.length,
      commissions: commissions.length,
      progressupdates: progress.length,
      reviews: reviews.length,
      complaints: complaints.length,
    };
    report.mongo = mongoBefore;
    report.postgres_before = await counts(pg);

    const users = new Map((await prisma.users.findMany({
      where: { legacy_mongo_id: { not: null } },
      select: { id: true, legacy_mongo_id: true },
    })).map((row) => [row.legacy_mongo_id, row.id]));
    const stores = new Map((await prisma.stores.findMany({
      where: { legacy_mongo_id: { not: null } },
      select: { id: true, legacy_mongo_id: true },
    })).map((row) => [row.legacy_mongo_id, row.id]));

    await prisma.$transaction(async (tx) => {
      const ruleByLegacy = new Map();
      const existingRules = await tx.commission_rules.findMany({
        select: { id: true, legacy_mongo_id: true, is_active: true },
      });
      for (const row of existingRules) {
        if (row.legacy_mongo_id) ruleByLegacy.set(row.legacy_mongo_id, row.id);
      }
      const mongoActive = rules.filter((doc) => doc.active && !ruleByLegacy.has(idOf(doc._id)));
      const placeholder = existingRules.find((row) => row.is_active && !row.legacy_mongo_id);
      if (mongoActive.length === 1 && placeholder) {
        await tx.commission_rules.update({
          where: { id: placeholder.id },
          data: { is_active: false, updated_at: new Date() },
        });
        report.active_rule_resolution = {
          postgres_rule_id: String(placeholder.id),
          action: 'set_inactive',
          reason: 'PostgreSQL allows one active commission rule. The existing row has no mongo id, so the mongo active rule keeps is_active.',
          mongo_active_id: idOf(mongoActive[0]._id),
        };
      }
      for (const doc of rules) {
        const mongoId = idOf(doc._id);
        if (ruleByLegacy.has(mongoId)) {
          report.already_mapped.commission_rules += 1;
          continue;
        }
        const percentage = money(doc.percentage);
        if (percentage == null || Number(percentage) < 0 || Number(percentage) > 30 || !text(doc.name, 80)) {
          skip(report, 'commissionrules', mongoId, 'percentage or name is outside the PostgreSQL rule');
          continue;
        }
        const row = await tx.commission_rules.create({
          data: {
            legacy_mongo_id: mongoId,
            name: text(doc.name, 80),
            percentage,
            is_active: Boolean(doc.active),
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || doc.createdAt || new Date(),
          },
        });
        ruleByLegacy.set(mongoId, row.id);
        report.inserted.commission_rules += 1;
      }

      const quotations = new Map((await tx.quotations.findMany({
        where: { legacy_mongo_id: { not: null } },
        select: { id: true, legacy_mongo_id: true },
      })).map((row) => [row.legacy_mongo_id, row.id]));
      const requests = new Map((await tx.repair_requests.findMany({
        where: { legacy_mongo_id: { not: null } },
        select: { id: true, legacy_mongo_id: true },
      })).map((row) => [row.legacy_mongo_id, row.id]));
      const orderByLegacy = new Map();
      const orderCodeOwner = new Map();
      const quotationOwner = new Map();
      const requestOwner = new Map();
      for (const row of await tx.service_orders.findMany({
        select: { id: true, legacy_mongo_id: true, order_code: true, quotation_id: true, repair_request_id: true },
      })) {
        if (row.legacy_mongo_id) orderByLegacy.set(row.legacy_mongo_id, row.id);
        orderCodeOwner.set(row.order_code, row.legacy_mongo_id);
        quotationOwner.set(String(row.quotation_id), row.legacy_mongo_id);
        requestOwner.set(String(row.repair_request_id), row.legacy_mongo_id);
      }

      for (const doc of orders) {
        const mongoId = idOf(doc._id);
        if (orderByLegacy.has(mongoId)) {
          report.already_mapped.service_orders += 1;
          continue;
        }
        const customer = users.get(idOf(doc.customerId));
        const contractor = users.get(idOf(doc.contractorId));
        const quotationId = quotations.get(idOf(doc.quotationId));
        const requestId = requests.get(idOf(doc.requestId));
        if (!customer || !contractor || !quotationId || !requestId) {
          skip(report, 'orders', mongoId, 'customer, contractor, quotation, or repair request is not in PostgreSQL');
          continue;
        }
        if (!ORDER_STATUS.has(doc.status) || !PAYMENT_STATUS.has(doc.paymentStatus) || money(doc.amount) == null) {
          skip(report, 'orders', mongoId, 'status, payment status, or amount is outside the PostgreSQL order rule');
          continue;
        }
        const code = text(doc.orderCode, 80);
        if (!code) {
          skip(report, 'orders', mongoId, 'order code is empty');
          continue;
        }
        if (orderCodeOwner.has(code) && orderCodeOwner.get(code) !== mongoId) {
          report.collisions.push({ collection: 'orders', mongo_id: mongoId, reason: 'order code already used' });
          continue;
        }
        if (quotationOwner.has(String(quotationId)) || requestOwner.has(String(requestId))) {
          report.collisions.push({ collection: 'orders', mongo_id: mongoId, reason: 'quotation or repair request already has an order' });
          continue;
        }
        let storeId = null;
        if (doc.storeId) {
          storeId = stores.get(idOf(doc.storeId)) || null;
          if (!storeId) note(report, 'orders', mongoId, 'store is not in PostgreSQL');
        }
        let cancelledBy = null;
        if (doc.cancelledBy) {
          cancelledBy = users.get(idOf(doc.cancelledBy)) || null;
          if (!cancelledBy) note(report, 'orders', mongoId, 'cancelledBy user is not in PostgreSQL');
        }
        const geo = pointOf(doc.location);
        let locationId = null;
        if (geo) {
          const location = await tx.locations.create({
            data: {
              latitude: geo.lat,
              longitude: geo.lng,
              is_confirmed: false,
              created_at: doc.createdAt || new Date(),
              updated_at: doc.updatedAt || doc.createdAt || new Date(),
            },
          });
          locationId = location.id;
        }
        const row = await tx.service_orders.create({
          data: {
            legacy_mongo_id: mongoId,
            order_code: code,
            quotation_id: quotationId,
            repair_request_id: requestId,
            customer_user_id: customer,
            contractor_user_id: contractor,
            store_id: storeId,
            title: text(doc.title, 140),
            description: text(doc.description, 2000),
            location_id: locationId,
            amount: money(doc.amount),
            status: doc.status,
            payment_status: doc.paymentStatus,
            cancel_reason: text(doc.cancelReason, 500),
            cancelled_by: cancelledBy,
            cancelled_at: doc.cancelledAt || null,
            completed_at: doc.completedAt || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || doc.createdAt || new Date(),
          },
        });
        orderByLegacy.set(mongoId, row.id);
        orderCodeOwner.set(code, mongoId);
        quotationOwner.set(String(quotationId), mongoId);
        requestOwner.set(String(requestId), mongoId);
        report.inserted.service_orders += 1;
      }

      const paymentByLegacy = new Map();
      const paymentTypeOwner = new Set();
      for (const row of await tx.payments.findMany({ select: { id: true, legacy_mongo_id: true, service_order_id: true, payment_type: true } })) {
        if (row.legacy_mongo_id) paymentByLegacy.set(row.legacy_mongo_id, row.id);
        paymentTypeOwner.add(`${row.service_order_id}:${row.payment_type}`);
      }
      for (const doc of payments) {
        const mongoId = idOf(doc._id);
        if (paymentByLegacy.has(mongoId)) {
          report.already_mapped.payments += 1;
          continue;
        }
        const orderId = orderByLegacy.get(idOf(doc.orderId));
        const customer = users.get(idOf(doc.customerId));
        const contractor = users.get(idOf(doc.contractorId));
        if (!orderId || !customer || !contractor) {
          skip(report, 'payments', mongoId, 'order, customer, or contractor is not in PostgreSQL');
          continue;
        }
        const type = doc.type || 'FULL_PAYMENT';
        if (!PAYMENT_TYPE.has(type) || !PAYMENT_STATUS.has(doc.status) || money(doc.amount) == null) {
          skip(report, 'payments', mongoId, 'type, status, or amount is outside the PostgreSQL payment rule');
          continue;
        }
        const typeKey = `${orderId}:${type}`;
        if (paymentTypeOwner.has(typeKey)) {
          report.collisions.push({ collection: 'payments', mongo_id: mongoId, reason: 'order already has this payment type' });
          continue;
        }
        const row = await tx.payments.create({
          data: {
            legacy_mongo_id: mongoId,
            service_order_id: orderId,
            customer_user_id: customer,
            contractor_user_id: contractor,
            amount: money(doc.amount),
            payment_type: type,
            status: doc.status,
            provider: text(doc.provider || 'mock', 50) || 'mock',
            transaction_code: doc.transactionCode ? text(doc.transactionCode, 255) : null,
            metadata: doc.metadata || {},
            paid_at: doc.paidAt || null,
            refunded_at: doc.refundedAt || null,
            failed_at: doc.failedAt || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || doc.createdAt || new Date(),
          },
        });
        paymentByLegacy.set(mongoId, row.id);
        paymentTypeOwner.add(typeKey);
        report.inserted.payments += 1;
      }

      const commissionByLegacy = new Map();
      const commissionPaymentOwner = new Set();
      for (const row of await tx.commissions.findMany({ select: { id: true, legacy_mongo_id: true, payment_id: true } })) {
        if (row.legacy_mongo_id) commissionByLegacy.set(row.legacy_mongo_id, row.id);
        commissionPaymentOwner.add(String(row.payment_id));
      }
      for (const doc of commissions) {
        const mongoId = idOf(doc._id);
        if (commissionByLegacy.has(mongoId)) {
          report.already_mapped.commissions += 1;
          continue;
        }
        const paymentId = paymentByLegacy.get(idOf(doc.paymentId));
        const orderId = orderByLegacy.get(idOf(doc.orderId));
        const contractor = users.get(idOf(doc.contractorId));
        if (!paymentId || !orderId || !contractor) {
          skip(report, 'commissions', mongoId, 'payment, order, or contractor is not in PostgreSQL');
          continue;
        }
        const rate = money(doc.rateSnapshot);
        if (!COMMISSION_STATUS.has(doc.status) || rate == null || Number(rate) < 0 || Number(rate) > 30 || money(doc.platformAmount) == null || money(doc.contractorAmount) == null) {
          skip(report, 'commissions', mongoId, 'status, rate, or amount is outside the PostgreSQL commission rule');
          continue;
        }
        if (commissionPaymentOwner.has(String(paymentId))) {
          report.collisions.push({ collection: 'commissions', mongo_id: mongoId, reason: 'payment already has a commission' });
          continue;
        }
        const row = await tx.commissions.create({
          data: {
            legacy_mongo_id: mongoId,
            payment_id: paymentId,
            service_order_id: orderId,
            contractor_user_id: contractor,
            rate_snapshot: rate,
            platform_amount: money(doc.platformAmount),
            contractor_amount: money(doc.contractorAmount),
            status: doc.status,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || doc.createdAt || new Date(),
          },
        });
        commissionByLegacy.set(mongoId, row.id);
        commissionPaymentOwner.add(String(paymentId));
        report.inserted.commissions += 1;
        const payment = payments.find((item) => idOf(item._id) === idOf(doc.paymentId));
        if (payment && !sameMoney(Number(doc.platformAmount) + Number(doc.contractorAmount), payment.amount)) {
          report.total_mismatches.push({
            mongo_id: mongoId,
            reason: 'stored commission parts do not add up to the stored payment amount',
            platform: doc.platformAmount,
            contractor: doc.contractorAmount,
            payment: payment.amount,
          });
        }
      }

      const progressByLegacy = new Map();
      for (const row of await tx.progress_updates.findMany({ select: { id: true, legacy_mongo_id: true } })) {
        if (row.legacy_mongo_id) progressByLegacy.set(row.legacy_mongo_id, row.id);
      }
      for (const doc of progress) {
        const mongoId = idOf(doc._id);
        if (progressByLegacy.has(mongoId)) {
          report.already_mapped.progress_updates += 1;
          continue;
        }
        const orderId = orderByLegacy.get(idOf(doc.orderId));
        if (!orderId) {
          skip(report, 'progressupdates', mongoId, 'order is not in PostgreSQL');
          continue;
        }
        if (!PROGRESS_STATUS.has(doc.status)) {
          skip(report, 'progressupdates', mongoId, 'status is outside the PostgreSQL progress rule');
          continue;
        }
        let actorId = null;
        if (doc.actorId) {
          actorId = users.get(idOf(doc.actorId)) || null;
          if (!actorId) note(report, 'progressupdates', mongoId, 'actor is not in PostgreSQL');
        }
        const geo = pointOf(doc.location);
        let locationId = null;
        if (geo) {
          const location = await tx.locations.create({
            data: {
              latitude: geo.lat,
              longitude: geo.lng,
              is_confirmed: false,
              created_at: doc.createdAt || new Date(),
              updated_at: doc.createdAt || new Date(),
            },
          });
          locationId = location.id;
        }
        const row = await tx.progress_updates.create({
          data: {
            legacy_mongo_id: mongoId,
            service_order_id: orderId,
            status: doc.status,
            description: text(doc.description, 2000),
            actor_user_id: actorId,
            location_id: locationId,
            created_at: doc.createdAt || new Date(),
          },
        });
        const images = Array.isArray(doc.images) ? doc.images : [];
        const videos = Array.isArray(doc.videos) ? doc.videos : [];
        const media = [...images, ...videos].filter(Boolean);
        for (let index = 0; index < media.length; index += 1) {
          await tx.progress_media.create({
            data: { progress_update_id: row.id, file_url: String(media[index]), sort_order: index },
          });
        }
        progressByLegacy.set(mongoId, row.id);
        report.inserted.progress_updates += 1;
      }

      const reviewByLegacy = new Map();
      for (const row of await tx.reviews.findMany({ select: { id: true, legacy_mongo_id: true } })) {
        if (row.legacy_mongo_id) reviewByLegacy.set(row.legacy_mongo_id, row.id);
      }
      for (const doc of reviews) {
        const mongoId = idOf(doc._id);
        if (reviewByLegacy.has(mongoId)) {
          report.already_mapped.reviews += 1;
          continue;
        }
        const orderId = orderByLegacy.get(idOf(doc.orderId));
        const customer = users.get(idOf(doc.customerId));
        const target = users.get(idOf(doc.targetUserId));
        if (!orderId || !customer || !target) {
          skip(report, 'reviews', mongoId, 'order, customer, or target is not in PostgreSQL');
          continue;
        }
        const rating = Number(doc.rating);
        if (!REVIEW_TARGET.has(doc.targetType) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
          skip(report, 'reviews', mongoId, 'target or rating is outside the PostgreSQL review rule');
          continue;
        }
        const row = await tx.reviews.create({
          data: {
            legacy_mongo_id: mongoId,
            service_order_id: orderId,
            customer_user_id: customer,
            target_user_id: target,
            target_type: doc.targetType,
            rating,
            comment: text(doc.comment, 1000),
            contractor_reply: text(doc.contractorReply, 500),
            replied_at: doc.repliedAt || null,
            reported_at: doc.reportedAt || null,
            report_reason: text(doc.reportReason, 500),
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || doc.createdAt || new Date(),
          },
        });
        const images = Array.isArray(doc.images) ? doc.images.filter(Boolean) : [];
        for (let index = 0; index < images.length; index += 1) {
          await tx.review_media.create({ data: { review_id: row.id, file_url: String(images[index]), sort_order: index } });
        }
        reviewByLegacy.set(mongoId, row.id);
        report.inserted.reviews += 1;
      }

      const complaintByLegacy = new Map();
      for (const row of await tx.complaints.findMany({ select: { id: true, legacy_mongo_id: true } })) {
        if (row.legacy_mongo_id) complaintByLegacy.set(row.legacy_mongo_id, row.id);
      }
      for (const doc of complaints) {
        const mongoId = idOf(doc._id);
        if (complaintByLegacy.has(mongoId)) {
          report.already_mapped.complaints += 1;
          continue;
        }
        const orderId = orderByLegacy.get(idOf(doc.orderId));
        const createdBy = users.get(idOf(doc.createdBy));
        const against = users.get(idOf(doc.againstUser));
        if (!orderId || !createdBy || !against) {
          skip(report, 'complaints', mongoId, 'order, creator, or target is not in PostgreSQL');
          continue;
        }
        const description = text(doc.description, 2000);
        if (!COMPLAINT_STATUS.has(doc.status) || !text(doc.reason, 80) || description.length < 10) {
          skip(report, 'complaints', mongoId, 'status, reason, or description is outside the PostgreSQL complaint rule');
          continue;
        }
        let adminId = null;
        if (doc.adminId) {
          adminId = users.get(idOf(doc.adminId)) || null;
          if (!adminId) note(report, 'complaints', mongoId, 'admin user is not in PostgreSQL');
        }
        const row = await tx.complaints.create({
          data: {
            legacy_mongo_id: mongoId,
            service_order_id: orderId,
            created_by_user_id: createdBy,
            against_user_id: against,
            reason: text(doc.reason, 80),
            description,
            status: doc.status,
            admin_note: text(doc.adminNote, 2000),
            admin_user_id: adminId,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || doc.createdAt || new Date(),
          },
        });
        const attachments = Array.isArray(doc.attachments) ? doc.attachments.filter(Boolean) : [];
        for (let index = 0; index < attachments.length; index += 1) {
          await tx.complaint_attachments.create({
            data: { complaint_id: row.id, file_url: String(attachments[index]), sort_order: index },
          });
        }
        complaintByLegacy.set(mongoId, row.id);
        report.inserted.complaints += 1;
      }
    }, { timeout: 180000, maxWait: 20000 });

    report.committed = true;
    report.postgres_after = await counts(pg);
    report.mongo_after = {
      commissionrules: (await collection(mongo, 'commissionrules')).length,
      orders: (await collection(mongo, 'orders')).length,
      payments: (await collection(mongo, 'payments')).length,
      commissions: (await collection(mongo, 'commissions')).length,
      progressupdates: (await collection(mongo, 'progressupdates')).length,
      reviews: (await collection(mongo, 'reviews')).length,
      complaints: (await collection(mongo, 'complaints')).length,
    };
    report.mongo_writes = JSON.stringify(mongoBefore) !== JSON.stringify(report.mongo_after);

    const duplicates = await pg.query(`
      SELECT 'service_orders' AS table_name FROM public.service_orders WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'payments' FROM public.payments WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'commission_rules' FROM public.commission_rules WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'commissions' FROM public.commissions WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'progress_updates' FROM public.progress_updates WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'reviews' FROM public.reviews WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'complaints' FROM public.complaints WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    `);
    report.duplicate_legacy_ids = duplicates.rows.length;

    const mappedOrders = await prisma.service_orders.findMany({
      where: { legacy_mongo_id: { in: orders.map((doc) => idOf(doc._id)) } },
      select: { legacy_mongo_id: true, amount: true },
    });
    const orderAmount = new Map(mappedOrders.map((row) => [row.legacy_mongo_id, row.amount]));
    for (const doc of orders) {
      const stored = orderAmount.get(idOf(doc._id));
      if (stored == null) continue;
      if (!sameMoney(stored, doc.amount)) {
        report.total_mismatches.push({ mongo_id: idOf(doc._id), field: 'order.amount', mongo: doc.amount, postgres: String(stored) });
      }
    }
    const mappedPayments = await prisma.payments.findMany({
      where: { legacy_mongo_id: { in: payments.map((doc) => idOf(doc._id)) } },
      select: { legacy_mongo_id: true, amount: true, transaction_code: true },
    });
    const paymentAmount = new Map(mappedPayments.map((row) => [row.legacy_mongo_id, row]));
    for (const doc of payments) {
      const stored = paymentAmount.get(idOf(doc._id));
      if (!stored) continue;
      if (!sameMoney(stored.amount, doc.amount) || (stored.transaction_code || null) !== (doc.transactionCode || null)) {
        report.total_mismatches.push({
          mongo_id: idOf(doc._id),
          field: 'payment',
          mongo_amount: doc.amount,
          postgres_amount: String(stored.amount),
          mongo_transaction: doc.transactionCode || null,
          postgres_transaction: stored.transaction_code,
        });
      }
    }

    report.verification_pass = report.committed
      && report.duplicate_legacy_ids === 0
      && report.skipped.length === 0
      && report.collisions.length === 0
      && report.total_mismatches.length === 0
      && report.mongo_writes === false
      && report.orphans.filter((item) => !item.inserted_without_reference).length === 0;
  } catch (error) {
    report.error = error.message;
    report.committed = false;
    throw error;
  } finally {
    writeReport(report);
    await prisma.$disconnect().catch(() => {});
    await closeConnections(pg);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
