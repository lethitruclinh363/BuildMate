/**
 * Copy material orders, notifications, policies, audit logs,
 * location corrections, and contractor eKYC from MongoDB into PostgreSQL.
 * Does not delete PostgreSQL rows or write MongoDB.
 * Financial snapshots are copied as stored. They are not recomputed.
 */
const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');
const { prisma } = require('../../src/config/prisma');

const ORDER_STATUS = new Set(['PENDING_PAYMENT', 'DEPOSIT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'DELIVERING', 'DELIVERED', 'CUSTOMER_RECEIVED', 'COMPLETED', 'CANCELLED']);
const PAYMENT_STATUS = new Set(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']);
const ACTOR = new Set(['CUSTOMER', 'STORE', 'SYSTEM']);
const COMMISSION_STATUS = new Set(['POSTED', 'REVERSED']);
const NOTIFICATION_TYPE = new Set(['REQUEST', 'MESSAGE', 'QUOTATION', 'QUOTATION_ACCEPTED', 'QUOTATION_REJECTED', 'QUOTATION_MODIFY', 'STATUS_UPDATE', 'ORDER_CREATED', 'PROGRESS_UPDATED', 'ORDER_COMPLETED', 'CONTRACTOR_ACCEPTED_JOB', 'CONTRACTOR_STARTED_JOB', 'CONTRACTOR_UPDATED_PROGRESS', 'CONTRACTOR_COMPLETED_JOB', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'COMMISSION_CREATED', 'NEW_REVIEW', 'NEW_COMPLAINT', 'COMPLAINT_UPDATED']);
const POLICY_TYPE = new Set(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CUSTOMER_POLICY', 'CONTRACTOR_POLICY', 'MATERIAL_STORE_POLICY', 'PAYMENT_POLICY', 'REFUND_POLICY', 'COMMUNITY_GUIDELINE']);
const POLICY_STATUS = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const AUDIT_ACTION = new Set(['ADMIN_APPROVE', 'ADMIN_REJECT', 'QUOTATION_SENT', 'QUOTATION_ACCEPTED', 'QUOTATION_REJECTED', 'QUOTATION_MODIFY', 'REQUEST_STATUS', 'PROFILE_UPDATE', 'PASSWORD_CHANGE', 'AVATAR_UPDATE', 'ORDER_CREATED', 'PROGRESS_UPDATED', 'ORDER_COMPLETED', 'PAYMENT_CREATED', 'PAYMENT_PAID', 'PAYMENT_REFUNDED', 'COMMISSION_CREATED', 'REVIEW_CREATED', 'REVIEW_REPORTED', 'COMPLAINT_CREATED', 'COMPLAINT_RESOLVED', 'FEE_CHANGED', 'POLICY_UPDATED']);
const EKYC_STATUS = new Set(['NOT_STARTED', 'IN_PROGRESS', 'AI_CHECKING', 'AI_PASSED', 'AI_REVIEW_REQUIRED', 'AI_FAILED', 'SUBMITTED']);
const FACE = new Set(['MATCH', 'REVIEW_REQUIRED', 'NOT_MATCH']);
const LOCATION_SOURCE = new Set(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']);
const DIRECTIONS = { centerImage: 'CENTER', leftImage: 'LEFT', rightImage: 'RIGHT', upImage: 'UP', downImage: 'DOWN' };

const TABLES = [
  'material_orders', 'material_order_items', 'material_order_status_history',
  'material_order_payments', 'material_commissions', 'notifications', 'policies',
  'policy_revisions', 'audit_logs', 'location_corrections', 'contractor_ekyc_verifications',
  'ekyc_ocr_issues', 'ekyc_liveness_frames', 'ekyc_attempts', 'locations',
];

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function idOf(value) {
  if (value == null || value === '') return '';
  if (typeof value.toHexString === 'function') return value.toHexString();
  return String(value);
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : null;
}

function qty(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(3) : null;
}

function rate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) return null;
  return number.toFixed(2);
}

function pointOf(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: lat.toFixed(7), lng: lng.toFixed(7) };
}

function decision(value) {
  const raw = text(value, 30);
  return FACE.has(raw) ? raw : null;
}

function frames(liveness) {
  return Object.entries(DIRECTIONS)
    .map(([key, direction]) => ({ direction, file_url: text(liveness?.[key]) }))
    .filter((frame) => frame.file_url);
}

function skip(report, bucket, mongoId, reason, extra = {}) {
  const entry = { collection: bucket, mongo_id: mongoId, reason, ...extra };
  report.skipped.push(entry);
  if (/not in PostgreSQL|missing/.test(reason)) report.orphans.push(entry);
}

async function namedCollection(mongo, candidates) {
  const names = (await mongo.db.listCollections().toArray()).map((item) => item.name);
  const byLower = new Map(names.map((name) => [name.toLowerCase(), name]));
  const found = candidates.map((name) => byLower.get(name.toLowerCase())).find(Boolean);
  if (!found) return { name: candidates[0], rows: [] };
  return { name: found, rows: await mongo.db.collection(found).find({}).toArray() };
}

async function idMap(model) {
  const rows = await prisma[model].findMany({
    where: { legacy_mongo_id: { not: null } },
    select: { id: true, legacy_mongo_id: true },
  });
  return new Map(rows.map((row) => [row.legacy_mongo_id, row.id]));
}

async function counts(pg) {
  const out = {};
  for (const table of TABLES) {
    out[table] = Number((await pg.query(`SELECT COUNT(*)::int AS count FROM public.${table}`)).rows[0].count);
  }
  return out;
}

function writeReport(report) {
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'remaining-backfill-report.json'), JSON.stringify(report, null, 2));
}

async function main() {
  let pg;
  const report = {
    generated_at: new Date().toISOString(),
    committed: false,
    mongo: {},
    postgres_before: {},
    postgres_after: {},
    inserted: {},
    already_mapped: {},
    skipped: [],
    orphans: [],
    collisions: [],
    monetary_mismatches: [],
    verification_pass: false,
  };
  const buckets = ['material_orders', 'material_order_payments', 'material_commissions', 'notifications', 'policies', 'policy_revisions', 'audit_logs', 'location_corrections', 'contractor_ekyc_verifications'];
  for (const bucket of buckets) {
    report.inserted[bucket] = 0;
    report.already_mapped[bucket] = 0;
  }

  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const sources = {
      orders: await namedCollection(mongo, ['materialOrders', 'materialorders']),
      payments: await namedCollection(mongo, ['materialOrderPayments', 'materialorderpayments']),
      commissions: await namedCollection(mongo, ['materialCommissions', 'materialcommissions']),
      notifications: await namedCollection(mongo, ['notifications']),
      policies: await namedCollection(mongo, ['policies']),
      revisions: await namedCollection(mongo, ['policyrevisions', 'policyRevisions']),
      audits: await namedCollection(mongo, ['auditlogs', 'auditLogs']),
      corrections: await namedCollection(mongo, ['locationcorrections', 'locationCorrections']),
      ekyc: await namedCollection(mongo, ['contractorekycverifications', 'contractorEkycVerifications']),
    };
    for (const [key, source] of Object.entries(sources)) {
      report.mongo[source.name || key] = source.rows.length;
    }
    const mongoBefore = { ...report.mongo };
    report.postgres_before = await counts(pg);

    const users = await idMap('users');
    const stores = await idMap('stores');
    const materials = await idMap('materials');
    const profiles = await idMap('contractor_profiles');
    const orders = await idMap('material_orders');
    const payments = await idMap('material_order_payments');
    const commissions = await idMap('material_commissions');
    const policies = await idMap('policies');
    const revisions = await idMap('policy_revisions');
    const notes = await idMap('notifications');
    const audits = await idMap('audit_logs');
    const corrections = await idMap('location_corrections');
    const ekycRows = await prisma.contractor_ekyc_verifications.findMany({
      select: { id: true, legacy_mongo_id: true, user_id: true, contractor_profile_id: true },
    });
    const ekycByLegacy = new Map(ekycRows.filter((row) => row.legacy_mongo_id).map((row) => [row.legacy_mongo_id, row]));
    const ekycByUser = new Map(ekycRows.map((row) => [String(row.user_id), row]));
    const ekycByProfile = new Map(ekycRows.map((row) => [String(row.contractor_profile_id), row]));
    const profileByUser = new Map();
    const profileRows = await prisma.contractor_profiles.findMany({
      select: { id: true, legacy_mongo_id: true, user_id: true },
    });
    for (const row of profileRows) profileByUser.set(String(row.user_id), row);

    const orderPg = new Map(orders);
    const paymentPg = new Map(payments);
    const policyPg = new Map(policies);

    await prisma.$transaction(async (tx) => {
      for (const doc of sources.orders.rows) {
        const legacy = idOf(doc._id);
        if (orderPg.has(legacy)) {
          report.already_mapped.material_orders += 1;
          continue;
        }
        const customer = users.get(idOf(doc.customerId));
        const store = stores.get(idOf(doc.storeId));
        const owner = users.get(idOf(doc.storeOwnerId));
        if (!customer || !store || !owner) {
          skip(report, 'materialOrders', legacy, 'customer, store, or store owner is not in PostgreSQL');
          continue;
        }
        if (!ORDER_STATUS.has(doc.status) || !PAYMENT_STATUS.has(doc.paymentStatus || 'UNPAID')) {
          skip(report, 'materialOrders', legacy, 'status is outside the PostgreSQL check');
          continue;
        }
        const point = pointOf(doc.deliveryLocation);
        if (!point || !text(doc.deliveryAddress)) {
          skip(report, 'materialOrders', legacy, 'delivery location is missing');
          continue;
        }
        const snapshots = {
          material_subtotal: money(doc.materialSubtotal),
          shipping_fee: money(doc.shippingFee),
          total_amount: money(doc.totalAmount),
          deposit_rate_snapshot: rate(doc.depositRateSnapshot),
          deposit_amount: money(doc.depositAmount),
          platform_fee_rate_snapshot: rate(doc.platformFeeRateSnapshot),
          platform_fee_amount: money(doc.platformFeeAmount),
          store_deposit_amount: money(doc.storeDepositAmount),
          remaining_amount: money(doc.remainingAmount),
        };
        if (Object.values(snapshots).some((value) => value == null)) {
          skip(report, 'materialOrders', legacy, 'financial snapshot is missing or out of range');
          continue;
        }
        const items = [];
        let itemBlocked = false;
        for (const [index, item] of (doc.items || []).entries()) {
          const material = materials.get(idOf(item.materialId));
          if (!material || Number(item.quantity) < 1) {
            itemBlocked = true;
            skip(report, 'materialOrders', legacy, 'material item is not in PostgreSQL or quantity is below 1', { material_id: idOf(item.materialId) });
            break;
          }
          items.push({
            material_id: material,
            name_snapshot: text(item.nameSnapshot, 120) || 'Material',
            image_snapshot: text(item.imageSnapshot),
            unit_snapshot: text(item.unitSnapshot, 50),
            price_snapshot: money(item.priceSnapshot),
            quantity: qty(item.quantity),
            line_total: money(item.lineTotal),
            sort_order: index,
          });
        }
        if (itemBlocked || !items.length) continue;
        const history = [];
        for (const entry of doc.statusHistory || []) {
          if (!ORDER_STATUS.has(entry.status) || !ACTOR.has(entry.actorRole)) {
            skip(report, 'materialOrders', legacy, 'status history entry is outside the PostgreSQL check');
            continue;
          }
          const actor = entry.actorId ? users.get(idOf(entry.actorId)) : null;
          if (entry.actorId && !actor) {
            report.orphans.push({ collection: 'materialOrders', mongo_id: legacy, reason: 'history actor is not in PostgreSQL', inserted_without_reference: true });
          }
          history.push({
            status: entry.status,
            actor_user_id: actor || null,
            actor_role: entry.actorRole,
            note: text(entry.note, 500),
            created_at: entry.createdAt || doc.createdAt || new Date(),
          });
        }
        const source = LOCATION_SOURCE.has(doc.locationSource) ? doc.locationSource : null;
        const location = await tx.locations.create({
          data: {
            formatted_address: text(doc.deliveryAddress),
            latitude: point.lat,
            longitude: point.lng,
            location_source: source,
            is_confirmed: Boolean(doc.locationConfirmed),
            confirmed_at: doc.locationConfirmed ? doc.locationConfirmedAt || null : null,
          },
        });
        const created = await tx.material_orders.create({
          data: {
            legacy_mongo_id: legacy,
            order_code: text(doc.orderCode, 80),
            customer_user_id: customer,
            store_id: store,
            store_owner_user_id: owner,
            delivery_location_id: location.id,
            distance_km: qty(doc.distanceKm),
            ...snapshots,
            payment_status: doc.paymentStatus || 'UNPAID',
            status: doc.status,
            customer_note: text(doc.customerNote, 500),
            remaining_settled_offline: Boolean(doc.remainingSettledOffline),
            remaining_settled_at: doc.remainingSettledAt || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
            material_order_items: { create: items },
            material_order_status_history: { create: history },
          },
        });
        orderPg.set(legacy, created.id);
        report.inserted.material_orders += 1;
        const stored = await tx.material_orders.findUnique({ where: { id: created.id } });
        for (const key of Object.keys(snapshots)) {
          if (money(stored[key]) !== snapshots[key] && rate(stored[key]) !== snapshots[key]) {
            report.monetary_mismatches.push({ mongo_id: legacy, field: key });
          }
        }
      }

      for (const doc of sources.payments.rows) {
        const legacy = idOf(doc._id);
        if (paymentPg.has(legacy)) {
          report.already_mapped.material_order_payments += 1;
          continue;
        }
        const order = orderPg.get(idOf(doc.materialOrderId));
        const customer = users.get(idOf(doc.customerId));
        const owner = users.get(idOf(doc.storeOwnerId));
        if (!order || !customer || !owner) {
          skip(report, 'materialOrderPayments', legacy, 'order, customer, or store owner is not in PostgreSQL');
          continue;
        }
        if (!PAYMENT_STATUS.has(doc.status || 'UNPAID')) {
          skip(report, 'materialOrderPayments', legacy, 'payment status is outside the PostgreSQL check');
          continue;
        }
        const created = await tx.material_order_payments.create({
          data: {
            legacy_mongo_id: legacy,
            material_order_id: order,
            customer_user_id: customer,
            store_owner_user_id: owner,
            amount: money(doc.amount),
            platform_fee_amount: money(doc.platformFeeAmount),
            store_deposit_amount: money(doc.storeDepositAmount),
            status: doc.status || 'UNPAID',
            provider: text(doc.provider || 'mock', 50) || 'mock',
            transaction_code: text(doc.transactionCode, 255) || null,
            metadata: doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {},
            paid_at: doc.paidAt || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        paymentPg.set(legacy, created.id);
        report.inserted.material_order_payments += 1;
      }

      for (const doc of sources.commissions.rows) {
        const legacy = idOf(doc._id);
        if (commissions.has(legacy)) {
          report.already_mapped.material_commissions += 1;
          continue;
        }
        const payment = paymentPg.get(idOf(doc.materialOrderPaymentId));
        const order = orderPg.get(idOf(doc.materialOrderId));
        const owner = users.get(idOf(doc.storeOwnerId));
        const snapshot = rate(doc.rateSnapshot);
        if (!payment || !order || !owner || snapshot == null || !COMMISSION_STATUS.has(doc.status || 'POSTED')) {
          skip(report, 'materialCommissions', legacy, 'payment, order, owner, or rate snapshot is not usable');
          continue;
        }
        await tx.material_commissions.create({
          data: {
            legacy_mongo_id: legacy,
            material_order_payment_id: payment,
            material_order_id: order,
            store_owner_user_id: owner,
            rate_snapshot: snapshot,
            platform_amount: money(doc.platformAmount),
            store_amount: money(doc.storeAmount),
            status: doc.status || 'POSTED',
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        report.inserted.material_commissions += 1;
      }

      for (const doc of sources.notifications.rows) {
        const legacy = idOf(doc._id);
        if (notes.has(legacy)) {
          report.already_mapped.notifications += 1;
          continue;
        }
        const user = users.get(idOf(doc.userId));
        if (!user) {
          skip(report, 'notifications', legacy, 'user is not in PostgreSQL');
          continue;
        }
        if (!NOTIFICATION_TYPE.has(doc.type)) {
          skip(report, 'notifications', legacy, `notification type ${doc.type || ''} is outside the PostgreSQL check`);
          continue;
        }
        await tx.notifications.create({
          data: {
            legacy_mongo_id: legacy,
            user_id: user,
            title: text(doc.title, 140) || 'Notice',
            message: text(doc.message, 400) || 'Notice',
            notification_type: doc.type,
            is_read: Boolean(doc.isRead),
            link: text(doc.link),
            meta: doc.meta && typeof doc.meta === 'object' ? doc.meta : {},
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        report.inserted.notifications += 1;
      }

      for (const doc of sources.policies.rows) {
        const legacy = idOf(doc._id);
        if (policyPg.has(legacy)) {
          report.already_mapped.policies += 1;
          continue;
        }
        const language = text(doc.language, 2);
        if (!POLICY_TYPE.has(doc.type) || !POLICY_STATUS.has(doc.status || 'DRAFT') || !['vi', 'en'].includes(language)) {
          skip(report, 'policies', legacy, 'policy type, language, or status is outside the PostgreSQL check');
          continue;
        }
        const author = doc.createdBy ? users.get(idOf(doc.createdBy)) : null;
        if (doc.createdBy && !author) {
          report.orphans.push({ collection: 'policies', mongo_id: legacy, reason: 'createdBy is not in PostgreSQL', inserted_without_reference: true });
        }
        const created = await tx.policies.create({
          data: {
            legacy_mongo_id: legacy,
            title: text(doc.title, 160) || 'Policy',
            policy_type: doc.type,
            content: String(doc.content || ''),
            language,
            version: text(doc.version, 32) || '1',
            status: doc.status || 'DRAFT',
            effective_date: doc.effectiveDate || null,
            created_by: author || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        policyPg.set(legacy, created.id);
        report.inserted.policies += 1;
      }

      for (const doc of sources.revisions.rows) {
        const legacy = idOf(doc._id);
        if (revisions.has(legacy)) {
          report.already_mapped.policy_revisions += 1;
          continue;
        }
        const policy = policyPg.get(idOf(doc.policyId));
        const language = text(doc.language, 2);
        if (!policy || !POLICY_TYPE.has(doc.type) || !POLICY_STATUS.has(doc.status) || !['vi', 'en'].includes(language)) {
          skip(report, 'policyrevisions', legacy, 'policy reference, type, language, or status is not usable');
          continue;
        }
        const editor = doc.editedBy ? users.get(idOf(doc.editedBy)) : null;
        if (doc.editedBy && !editor) {
          report.orphans.push({ collection: 'policyrevisions', mongo_id: legacy, reason: 'editedBy is not in PostgreSQL', inserted_without_reference: true });
        }
        await tx.policy_revisions.create({
          data: {
            legacy_mongo_id: legacy,
            policy_id: policy,
            title: text(doc.title, 160) || 'Policy',
            policy_type: doc.type,
            content: String(doc.content || ''),
            language,
            version: text(doc.version, 32) || '1',
            status: doc.status,
            effective_date: doc.effectiveDate || null,
            edited_by: editor || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        report.inserted.policy_revisions += 1;
      }

      for (const doc of sources.audits.rows) {
        const legacy = idOf(doc._id);
        if (audits.has(legacy)) {
          report.already_mapped.audit_logs += 1;
          continue;
        }
        if (!AUDIT_ACTION.has(doc.action)) {
          skip(report, 'auditlogs', legacy, `audit action ${doc.action || ''} is outside the PostgreSQL check`);
          continue;
        }
        const actor = doc.actorId ? users.get(idOf(doc.actorId)) : null;
        if (doc.actorId && !actor) {
          report.orphans.push({ collection: 'auditlogs', mongo_id: legacy, reason: 'actor is not in PostgreSQL', inserted_without_reference: true });
        }
        await tx.audit_logs.create({
          data: {
            legacy_mongo_id: legacy,
            actor_user_id: actor || null,
            actor_role: text(doc.actorRole, 50),
            action: doc.action,
            entity_type: text(doc.entityType, 100) || 'Unknown',
            entity_id: text(doc.entityId, 100),
            meta: doc.meta && typeof doc.meta === 'object' ? doc.meta : {},
            ip: text(doc.ip, 100),
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        report.inserted.audit_logs += 1;
      }

      for (const doc of sources.corrections.rows) {
        const legacy = idOf(doc._id);
        if (corrections.has(legacy)) {
          report.already_mapped.location_corrections += 1;
          continue;
        }
        const address = text(doc.normalizedAddress);
        const point = pointOf(doc.location);
        if (!address || !point) {
          skip(report, 'locationcorrections', legacy, 'normalized address or coordinate is missing');
          continue;
        }
        const existing = await tx.location_corrections.findFirst({ where: { normalized_address: address } });
        if (existing) {
          report.collisions.push({ collection: 'locationcorrections', mongo_id: legacy, reason: 'normalized address already exists' });
          continue;
        }
        const location = await tx.locations.create({
          data: {
            formatted_address: address,
            latitude: point.lat,
            longitude: point.lng,
            provider_ref_id: text(doc.providerRefId, 2000) || null,
            is_confirmed: true,
            confirmed_at: doc.lastConfirmedAt || doc.updatedAt || new Date(),
          },
        });
        await tx.location_corrections.create({
          data: {
            legacy_mongo_id: legacy,
            normalized_address: address,
            location_id: location.id,
            provider_ref_id: text(doc.providerRefId, 2000),
            confirmed_count: Math.max(0, Number(doc.confirmedCount) || 0),
            last_confirmed_at: doc.lastConfirmedAt || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        report.inserted.location_corrections += 1;
      }

      for (const doc of sources.ekyc.rows) {
        const legacy = idOf(doc._id);
        if (ekycByLegacy.has(legacy)) {
          report.already_mapped.contractor_ekyc_verifications += 1;
          continue;
        }
        const user = users.get(idOf(doc.userId));
        const profile = profiles.get(idOf(doc.contractorId))
          ? { id: profiles.get(idOf(doc.contractorId)), user_id: user }
          : (user ? profileByUser.get(String(user)) : null);
        if (!user || !profile) {
          skip(report, 'contractorekycverifications', legacy, 'user or contractor profile is not in PostgreSQL');
          continue;
        }
        if (ekycByUser.has(String(user)) || ekycByProfile.has(String(profile.id))) {
          report.collisions.push({ collection: 'contractorekycverifications', mongo_id: legacy, reason: 'user or profile already has an eKYC row; existing PostgreSQL row was kept' });
          continue;
        }
        if (!EKYC_STATUS.has(doc.status || 'NOT_STARTED')) {
          skip(report, 'contractorekycverifications', legacy, 'eKYC status is outside the PostgreSQL check');
          continue;
        }
        const admin = doc.adminReview?.reviewedBy ? users.get(idOf(doc.adminReview.reviewedBy)) : null;
        if (doc.adminReview?.reviewedBy && !admin) {
          report.orphans.push({ collection: 'contractorekycverifications', mongo_id: legacy, reason: 'admin reviewer is not in PostgreSQL', inserted_without_reference: true });
        }
        const created = await tx.contractor_ekyc_verifications.create({
          data: {
            legacy_mongo_id: legacy,
            contractor_profile_id: profile.id,
            user_id: user,
            reference_code: text(doc.referenceCode, 150),
            status: doc.status || 'NOT_STARTED',
            legacy_front_document_id: idOf(doc.frontDocumentId).slice(0, 24) || null,
            legacy_back_document_id: idOf(doc.backDocumentId).slice(0, 24) || null,
            card_front_url: text(doc.cardImages?.front),
            card_back_url: text(doc.cardImages?.back),
            ocr_id_number: text(doc.ocr?.idNumber, 100),
            ocr_full_name: text(doc.ocr?.fullName, 255),
            ocr_date_of_birth: text(doc.ocr?.dateOfBirth, 50),
            ocr_gender: text(doc.ocr?.gender, 50),
            ocr_hometown: text(doc.ocr?.hometown),
            ocr_passed: Boolean(doc.ocr?.passed),
            liveness_passed: Boolean(doc.liveness?.passed),
            face_decision: decision(doc.faceMatch?.decision),
            face_matched: Boolean(doc.faceMatch?.matched),
            face_distance: doc.faceMatch?.distance == null ? null : Number(doc.faceMatch.distance).toFixed(8),
            face_threshold: doc.faceMatch?.threshold == null ? null : Number(doc.faceMatch.threshold).toFixed(8),
            face_template: Array.isArray(doc.faceTemplate) ? doc.faceTemplate : null,
            submitted_at: doc.submittedAt || null,
            processed_at: doc.processedAt || null,
            retake_reason: text(doc.retakeReason),
            admin_reviewed_by: admin || null,
            admin_reviewed_at: doc.adminReview?.reviewedAt || null,
            admin_decision: text(doc.adminReview?.decision, 100),
            admin_note: text(doc.adminReview?.note),
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
            ekyc_ocr_issues: {
              create: (doc.ocr?.issues || []).map((issue, index) => ({ issue: String(issue), sort_order: index })),
            },
            ekyc_liveness_frames: { create: frames(doc.liveness) },
          },
        });
        for (const attempt of doc.attempts || []) {
          const attemptAdmin = attempt.adminReview?.reviewedBy ? users.get(idOf(attempt.adminReview.reviewedBy)) : null;
          await tx.ekyc_attempts.create({
            data: {
              legacy_mongo_sub_id: /^[0-9a-f]{24}$/i.test(idOf(attempt._id)) ? idOf(attempt._id) : null,
              ekyc_verification_id: created.id,
              status: text(attempt.status, 30),
              ocr_id_number: text(attempt.ocr?.idNumber, 100),
              ocr_full_name: text(attempt.ocr?.fullName, 255),
              ocr_date_of_birth: text(attempt.ocr?.dateOfBirth, 50),
              ocr_gender: text(attempt.ocr?.gender, 50),
              ocr_hometown: text(attempt.ocr?.hometown),
              ocr_passed: Boolean(attempt.ocr?.passed),
              liveness_passed: Boolean(attempt.liveness?.passed),
              card_front_url: text(attempt.cardImages?.front),
              card_back_url: text(attempt.cardImages?.back),
              face_decision: decision(attempt.faceMatch?.decision),
              face_matched: Boolean(attempt.faceMatch?.matched),
              face_distance: attempt.faceMatch?.distance == null ? null : Number(attempt.faceMatch.distance).toFixed(8),
              face_threshold: attempt.faceMatch?.threshold == null ? null : Number(attempt.faceMatch.threshold).toFixed(8),
              admin_reviewed_by: attemptAdmin || null,
              admin_reviewed_at: attempt.adminReview?.reviewedAt || null,
              admin_decision: text(attempt.adminReview?.decision, 100),
              admin_note: text(attempt.adminReview?.note),
              submitted_at: attempt.submittedAt || null,
              processed_at: attempt.processedAt || null,
              archived_at: attempt.archivedAt || new Date(),
              ekyc_attempt_ocr_issues: {
                create: (attempt.ocr?.issues || []).map((issue, index) => ({ issue: String(issue), sort_order: index })),
              },
              ekyc_attempt_liveness_frames: { create: frames(attempt.liveness) },
            },
          });
        }
        ekycByUser.set(String(user), created);
        ekycByProfile.set(String(profile.id), created);
        report.inserted.contractor_ekyc_verifications += 1;
      }
    }, { timeout: 120000 });

    report.committed = true;
    report.postgres_after = await counts(pg);
    const mongoAfter = {};
    for (const source of Object.values(sources)) {
      mongoAfter[source.name] = await mongo.db.collection(source.name).countDocuments();
    }
    report.mongo_unchanged = JSON.stringify(mongoBefore) === JSON.stringify(mongoAfter);
    report.verification_pass = report.committed
      && report.mongo_unchanged
      && report.monetary_mismatches.length === 0
      && report.skipped.filter((row) => !row.reason.includes('outside')).length === report.orphans.filter((row) => !row.inserted_without_reference).length;
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    writeReport(report);
    console.log(JSON.stringify({
      committed: report.committed,
      inserted: report.inserted,
      already_mapped: report.already_mapped,
      skipped: report.skipped.length,
      orphans: report.orphans.length,
      collisions: report.collisions.length,
      monetary_mismatches: report.monetary_mismatches.length,
      mongo_unchanged: report.mongo_unchanged,
      verification_pass: report.verification_pass,
      error: report.error || '',
    }));
    await closeConnections(pg);
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
