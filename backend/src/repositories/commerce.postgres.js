const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const { legacyClause, enumClause } = require('./scopedQuery');
const { describePlace } = require('../utils/geo');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function client(tx) {
  return tx || prisma;
}

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function legacyOf(value) {
  if (value == null || value === '') return '';
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function num(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return num(value).toFixed(2);
}

function pointOf(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return { lng: null, lat: null };
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lng: null, lat: null };
  return { lng, lat };
}

function isOperator(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date)
    && typeof value.toHexString !== 'function'
    && value._bsontype !== 'ObjectID'
  );
}

function timeOf(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function matchValue(actual, expected) {
  if (isOperator(expected)) {
    if (expected.$in) return expected.$in.map((item) => legacyOf(item)).includes(legacyOf(actual));
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) return legacyOf(actual) !== legacyOf(expected.$ne);
    if (Object.prototype.hasOwnProperty.call(expected, '$eq')) return legacyOf(actual) === legacyOf(expected.$eq);
    if (Object.prototype.hasOwnProperty.call(expected, '$gte')) {
      if (expected.$gte instanceof Date) return (timeOf(actual) || 0) >= timeOf(expected.$gte);
      return Number(actual) >= Number(expected.$gte);
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$gt')) {
      if (expected.$gt instanceof Date) return (timeOf(actual) || 0) > timeOf(expected.$gt);
      return Number(actual) > Number(expected.$gt);
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$lt')) {
      return (timeOf(actual) || 0) < (timeOf(expected.$lt) || 0);
    }
    return false;
  }
  return legacyOf(actual) === legacyOf(expected);
}

function valueAt(doc, key) {
  if (!key.includes('.')) return doc[key];
  return key.split('.').reduce((current, part) => (current == null ? undefined : current[part]), doc);
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(doc, part));
    if (key === '_id') return matchValue(doc._id, value);
    return matchValue(valueAt(doc, key), value);
  });
}

function sortRows(rows, spec) {
  const keys = Object.entries(spec || {});
  return [...rows].sort((left, right) => {
    for (const [key, direction] of keys) {
      const leftTime = timeOf(left[key]);
      const rightTime = timeOf(right[key]);
      const delta = leftTime == null && rightTime == null
        ? String(left[key] || '').localeCompare(String(right[key] || ''))
        : (leftTime || 0) - (rightTime || 0);
      if (delta) return direction < 0 ? -delta : delta;
    }
    return 0;
  });
}

function chain(loader) {
  const state = { sort: null, lean: false, limit: null };
  const exec = async () => {
    let rows = await loader(state);
    if (state.sort) rows = sortRows(rows, state.sort);
    if (state.limit != null) rows = rows.slice(0, state.limit);
    if (state.lean) rows = rows.map((row) => (row.toPlain ? row.toPlain() : row));
    return rows;
  };
  const query = {
    sort(value) { state.sort = value; return query; },
    limit(value) { state.limit = Number(value); return query; },
    select() { return query; },
    lean() { state.lean = true; return query; },
    then(resolve, reject) { return exec().then(resolve, reject); },
    catch(reject) { return exec().catch(reject); },
  };
  return query;
}

function markDuplicate(err) {
  if (err?.code === 'P2002') err.code = 11000;
  throw err;
}

function evalExpr(expr, row) {
  if (typeof expr === 'string' && expr.startsWith('$')) return row[expr.slice(1)];
  if (expr && typeof expr === 'object' && expr.$year) return new Date(evalExpr(expr.$year, row)).getUTCFullYear();
  if (expr && typeof expr === 'object' && expr.$month) return new Date(evalExpr(expr.$month, row)).getUTCMonth() + 1;
  if (expr && typeof expr === 'object' && expr.$add) {
    return expr.$add.reduce((sum, item) => sum + num(evalExpr(item, row)), 0);
  }
  if (expr && typeof expr === 'object' && expr.$cond) {
    const [test, yes, no] = expr.$cond;
    return testCond(test, row) ? evalExpr(yes, row) : evalExpr(no, row);
  }
  return expr;
}

function testCond(test, row) {
  if (test?.$in) {
    const value = evalExpr(test.$in[0], row);
    return test.$in[1].map(String).includes(String(value));
  }
  if (test?.$eq) return String(evalExpr(test.$eq[0], row)) === String(evalExpr(test.$eq[1], row));
  if (test?.$gte) return (timeOf(evalExpr(test.$gte[0], row)) || 0) >= (timeOf(evalExpr(test.$gte[1], row)) || 0);
  return false;
}

function groupId(spec, row) {
  if (spec == null) return null;
  if (typeof spec === 'string') return evalExpr(spec, row);
  const out = {};
  for (const [key, value] of Object.entries(spec)) out[key] = evalExpr(value, row);
  return out;
}

function applyGroup(rows, spec) {
  const groups = new Map();
  for (const row of rows) {
    const id = groupId(spec._id, row);
    const key = JSON.stringify(id);
    if (!groups.has(key)) groups.set(key, { _id: id });
    const group = groups.get(key);
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue;
      if (!group[`__${field}`]) group[`__${field}`] = { sum: 0, count: 0 };
      const bucket = group[`__${field}`];
      if (acc.$sum !== undefined) {
        bucket.sum += acc.$sum === 1 ? 1 : num(evalExpr(acc.$sum, row));
        group[field] = bucket.sum;
      } else if (acc.$avg) {
        bucket.sum += num(evalExpr(acc.$avg, row));
        bucket.count += 1;
        group[field] = bucket.sum / bucket.count;
      }
    }
  }
  return [...groups.values()].map((group) => {
    const clean = { ...group };
    for (const key of Object.keys(clean)) if (key.startsWith('__')) delete clean[key];
    return clean;
  });
}

function runPipeline(rows, pipeline) {
  let current = rows;
  for (const stage of pipeline) {
    if (stage.$match) current = current.filter((row) => matches(row, stage.$match));
    else if (stage.$group) current = applyGroup(current, stage.$group);
    else if (stage.$facet) {
      const facet = {};
      for (const [name, sub] of Object.entries(stage.$facet)) facet[name] = runPipeline(current, sub);
      current = [facet];
    }
  }
  return current;
}

async function userId(legacyId, tx) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  const row = await client(tx).users.findFirst({ where: { legacy_mongo_id: id }, select: { id: true } });
  return row?.id || null;
}

async function saveLocation(currentId, fields, tx) {
  const db = client(tx);
  if (fields.lat == null || fields.lng == null) return currentId || null;
  const data = {
    formatted_address: text(fields.address, 2000) || null,
    city: text(fields.label, 120) || null,
    latitude: fields.lat,
    longitude: fields.lng,
    location_source: fields.locationSource || null,
    is_confirmed: Boolean(fields.locationConfirmed),
    confirmed_at: fields.locationConfirmed ? fields.confirmedAt || new Date() : null,
    updated_at: new Date(),
  };
  if (currentId) {
    await db.locations.update({ where: { id: currentId }, data });
    return currentId;
  }
  const created = await db.locations.create({ data: { ...data, created_at: new Date() } });
  return created.id;
}

function locationOf(row) {
  if (!row?.locations || row.locations.latitude == null || row.locations.longitude == null) return null;
  return {
    type: 'Point',
    coordinates: [num(row.locations.longitude), num(row.locations.latitude)],
  };
}

const orderInclude = {
  locations: true,
  quotations: { select: { legacy_mongo_id: true } },
  repair_requests: { select: { legacy_mongo_id: true } },
  stores: { select: { legacy_mongo_id: true } },
  users_service_orders_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_service_orders_contractor_user_idTousers: { select: { legacy_mongo_id: true } },
  users_service_orders_cancelled_byTousers: { select: { legacy_mongo_id: true } },
};

class PgOrder {
  constructor(data) {
    Object.assign(this, data);
    this.amount = num(data.amount);
  }

  toPublic() {
    return {
      id: this._id,
      orderCode: this.orderCode,
      quotationId: legacyOf(this.quotationId),
      requestId: legacyOf(this.requestId),
      customerId: legacyOf(this.customerId),
      contractorId: legacyOf(this.contractorId),
      storeId: this.storeId ? legacyOf(this.storeId) : null,
      title: this.title,
      description: this.description || '',
      location: this.location,
      place: describePlace({ location: this.location }),
      amount: this.amount,
      status: this.status,
      paymentStatus: this.paymentStatus,
      cancelReason: this.cancelReason || '',
      cancelledAt: this.cancelledAt || null,
      completedAt: this.completedAt || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, cancelledBy: this.cancelledBy || null };
  }

  async save(tx) {
    await persistOrder(this, tx);
    return this;
  }
}

function orderFromRow(row) {
  const location = locationOf(row);
  return new PgOrder({
    pgId: row.id,
    locationPgId: row.location_id,
    _id: row.legacy_mongo_id,
    orderCode: row.order_code,
    quotationId: row.quotations?.legacy_mongo_id || '',
    requestId: row.repair_requests?.legacy_mongo_id || '',
    customerId: row.users_service_orders_customer_user_idTousers?.legacy_mongo_id || '',
    contractorId: row.users_service_orders_contractor_user_idTousers?.legacy_mongo_id || '',
    storeId: row.stores?.legacy_mongo_id || null,
    title: row.title,
    description: row.description || '',
    location: location || { type: 'Point', coordinates: [105.746, 10.045] },
    amount: row.amount,
    status: row.status,
    paymentStatus: row.payment_status,
    cancelReason: row.cancel_reason || '',
    cancelledBy: row.users_service_orders_cancelled_byTousers?.legacy_mongo_id || null,
    cancelledAt: row.cancelled_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allOrders() {
  return (await prisma.service_orders.findMany({ include: orderInclude })).map(orderFromRow);
}

async function persistOrder(doc, tx) {
  const db = client(tx);
  const customer = await userId(doc.customerId, tx);
  const contractor = await userId(doc.contractorId, tx);
  const quotation = await db.quotations.findFirst({ where: { legacy_mongo_id: legacyOf(doc.quotationId) }, select: { id: true } });
  const request = await db.repair_requests.findFirst({ where: { legacy_mongo_id: legacyOf(doc.requestId) }, select: { id: true } });
  if (!customer || !contractor || !quotation || !request) {
    throw new Error('Service order quotation, request, or party is not in PostgreSQL');
  }
  const store = doc.storeId
    ? await db.stores.findFirst({ where: { legacy_mongo_id: legacyOf(doc.storeId) }, select: { id: true } })
    : null;
  if (doc.storeId && !store) throw new Error('Service order store is not in PostgreSQL');
  const cancelledBy = doc.cancelledBy ? await userId(doc.cancelledBy, tx) : null;
  if (doc.cancelledBy && !cancelledBy) throw new Error('Service order cancelledBy user is not in PostgreSQL');
  const geo = pointOf(doc.location);
  const locationId = await saveLocation(doc.locationPgId, {
    lat: geo.lat,
    lng: geo.lng,
    address: doc.address || '',
  }, tx);
  doc.locationPgId = locationId;
  const data = {
    order_code: text(doc.orderCode, 80),
    quotation_id: quotation.id,
    repair_request_id: request.id,
    customer_user_id: customer,
    contractor_user_id: contractor,
    store_id: store?.id || null,
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
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.service_orders.update({ where: { id: doc.pgId }, data })
    : await db.service_orders.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  doc.updatedAt = row.updated_at;
}

const paymentInclude = {
  service_orders: { select: { legacy_mongo_id: true } },
  users_payments_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_payments_contractor_user_idTousers: { select: { legacy_mongo_id: true } },
};

class PgPayment {
  constructor(data) {
    Object.assign(this, data);
    this.amount = num(data.amount);
    this.metadata = data.metadata || {};
  }

  toPublic() {
    return {
      id: this._id,
      orderId: legacyOf(this.orderId),
      customerId: legacyOf(this.customerId),
      contractorId: legacyOf(this.contractorId),
      amount: this.amount,
      type: this.type,
      status: this.status,
      provider: this.provider,
      transactionCode: this.transactionCode || null,
      metadata: this.metadata || {},
      paidAt: this.paidAt || null,
      refundedAt: this.refundedAt || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, failedAt: this.failedAt || null };
  }

  async save(tx) {
    await persistPayment(this, tx);
    return this;
  }
}

function paymentFromRow(row) {
  return new PgPayment({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    orderId: row.service_orders?.legacy_mongo_id || '',
    customerId: row.users_payments_customer_user_idTousers?.legacy_mongo_id || '',
    contractorId: row.users_payments_contractor_user_idTousers?.legacy_mongo_id || '',
    amount: row.amount,
    type: row.payment_type,
    status: row.status,
    provider: row.provider,
    transactionCode: row.transaction_code,
    metadata: row.metadata || {},
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allPayments() {
  return (await prisma.payments.findMany({ include: paymentInclude })).map(paymentFromRow);
}

async function persistPayment(doc, tx) {
  const db = client(tx);
  const order = await db.service_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.orderId) }, select: { id: true } });
  const customer = await userId(doc.customerId, tx);
  const contractor = await userId(doc.contractorId, tx);
  if (!order || !customer || !contractor) throw new Error('Payment order or party is not in PostgreSQL');
  const data = {
    service_order_id: order.id,
    customer_user_id: customer,
    contractor_user_id: contractor,
    amount: money(doc.amount),
    payment_type: doc.type || 'FULL_PAYMENT',
    status: doc.status || 'UNPAID',
    provider: text(doc.provider || 'mock', 50),
    transaction_code: doc.transactionCode ? text(doc.transactionCode, 255) : null,
    metadata: doc.metadata || {},
    paid_at: doc.paidAt || null,
    refunded_at: doc.refundedAt || null,
    failed_at: doc.failedAt || null,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.payments.update({ where: { id: doc.pgId }, data })
    : await db.payments.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  doc.updatedAt = row.updated_at;
}

class PgRule {
  constructor(data) {
    Object.assign(this, data);
    this.percentage = num(data.percentage);
    this.active = Boolean(data.active);
  }

  toPublic() {
    return {
      id: this._id,
      name: this.name,
      percentage: this.percentage,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id };
  }

  async save(tx) {
    await persistRule(this, tx);
    return this;
  }
}

function ruleFromRow(row) {
  return new PgRule({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    name: row.name,
    percentage: row.percentage,
    active: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allRules() {
  return (await prisma.commission_rules.findMany()).map(ruleFromRow);
}

async function persistRule(doc, tx) {
  const db = client(tx);
  const data = {
    name: text(doc.name, 80),
    percentage: money(doc.percentage),
    is_active: Boolean(doc.active),
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.commission_rules.update({ where: { id: doc.pgId }, data })
    : await db.commission_rules.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
}

const commissionInclude = {
  payments: { select: { legacy_mongo_id: true } },
  service_orders: { select: { legacy_mongo_id: true } },
  users: { select: { legacy_mongo_id: true } },
};

class PgCommission {
  constructor(data) {
    Object.assign(this, data);
    this.rateSnapshot = num(data.rateSnapshot);
    this.platformAmount = num(data.platformAmount);
    this.contractorAmount = num(data.contractorAmount);
  }

  toPublic() {
    return {
      id: this._id,
      paymentId: legacyOf(this.paymentId),
      orderId: legacyOf(this.orderId),
      contractorId: legacyOf(this.contractorId),
      rateSnapshot: this.rateSnapshot,
      platformAmount: this.platformAmount,
      contractorAmount: this.contractorAmount,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id };
  }

  async save(tx) {
    await persistCommission(this, tx);
    return this;
  }
}

function commissionFromRow(row) {
  return new PgCommission({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    paymentId: row.payments?.legacy_mongo_id || '',
    orderId: row.service_orders?.legacy_mongo_id || '',
    contractorId: row.users?.legacy_mongo_id || '',
    rateSnapshot: row.rate_snapshot,
    platformAmount: row.platform_amount,
    contractorAmount: row.contractor_amount,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allCommissions() {
  return (await prisma.commissions.findMany({ include: commissionInclude })).map(commissionFromRow);
}

async function persistCommission(doc, tx) {
  const db = client(tx);
  const payment = await db.payments.findFirst({ where: { legacy_mongo_id: legacyOf(doc.paymentId) }, select: { id: true } });
  const order = await db.service_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.orderId) }, select: { id: true } });
  const contractor = await userId(doc.contractorId, tx);
  if (!payment || !order || !contractor) throw new Error('Commission payment, order, or contractor is not in PostgreSQL');
  const data = {
    payment_id: payment.id,
    service_order_id: order.id,
    contractor_user_id: contractor,
    rate_snapshot: money(doc.rateSnapshot),
    platform_amount: money(doc.platformAmount),
    contractor_amount: money(doc.contractorAmount),
    status: doc.status || 'POSTED',
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.commissions.update({ where: { id: doc.pgId }, data })
    : await db.commissions.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
}

const progressInclude = {
  service_orders: { select: { legacy_mongo_id: true } },
  users: { select: { legacy_mongo_id: true } },
  locations: true,
  progress_media: { orderBy: { sort_order: 'asc' } },
};

class PgProgress {
  constructor(data) {
    Object.assign(this, data);
    this.images = [...(data.images || [])];
    this.videos = [...(data.videos || [])];
  }

  toPublic() {
    const location = this.location?.coordinates?.length >= 2 ? this.location : null;
    return {
      id: this._id,
      orderId: legacyOf(this.orderId),
      status: this.status,
      description: this.description || '',
      images: this.images,
      actorId: this.actorId || null,
      location,
      createdAt: this.createdAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, videos: this.videos };
  }

  async save(tx) {
    await persistProgress(this, tx);
    return this;
  }
}

function progressFromRow(row) {
  const urls = (row.progress_media || []).map((item) => item.file_url);
  const imageCount = row.__imageCount == null ? urls.length : row.__imageCount;
  return new PgProgress({
    pgId: row.id,
    locationPgId: row.location_id,
    _id: row.legacy_mongo_id,
    orderId: row.service_orders?.legacy_mongo_id || '',
    status: row.status,
    description: row.description || '',
    images: urls.slice(0, imageCount),
    videos: urls.slice(imageCount),
    actorId: row.users?.legacy_mongo_id || null,
    location: locationOf(row),
    createdAt: row.created_at,
  });
}

async function allProgress() {
  return (await prisma.progress_updates.findMany({ include: progressInclude })).map(progressFromRow);
}

async function persistProgress(doc, tx) {
  const db = client(tx);
  const order = await db.service_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.orderId) }, select: { id: true } });
  if (!order) throw new Error('Progress order is not in PostgreSQL');
  const actor = doc.actorId ? await userId(doc.actorId, tx) : null;
  const geo = pointOf(doc.location);
  const locationId = await saveLocation(doc.locationPgId, { lat: geo.lat, lng: geo.lng }, tx);
  doc.locationPgId = locationId;
  const data = {
    service_order_id: order.id,
    status: doc.status,
    description: text(doc.description, 2000),
    actor_user_id: actor,
    location_id: locationId,
  };
  const row = doc.pgId
    ? await db.progress_updates.update({ where: { id: doc.pgId }, data })
    : await db.progress_updates.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  await db.progress_media.deleteMany({ where: { progress_update_id: row.id } });
  const media = [...(doc.images || []), ...(doc.videos || [])];
  for (let index = 0; index < media.length; index += 1) {
    if (!media[index]) continue;
    await db.progress_media.create({
      data: { progress_update_id: row.id, file_url: media[index], sort_order: index },
    });
  }
}

const reviewInclude = {
  service_orders: { select: { legacy_mongo_id: true, title: true, order_code: true, status: true } },
  material_orders: { select: { legacy_mongo_id: true, order_code: true, status: true } },
  users_reviews_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_reviews_target_user_idTousers: { select: { legacy_mongo_id: true } },
  review_media: { orderBy: { sort_order: 'asc' } },
};

class PgReview {
  constructor(data) {
    Object.assign(this, data);
    this.images = [...(data.images || [])];
    this.rating = num(data.rating);
  }

  toPublic() {
    return {
      id: this._id,
      orderId: legacyOf(this.orderId),
      materialOrderId: legacyOf(this.materialOrderId),
      customerId: legacyOf(this.customerId),
      targetUserId: legacyOf(this.targetUserId),
      targetType: this.targetType,
      rating: this.rating,
      comment: this.comment || '',
      images: this.images,
      contractorReply: this.contractorReply || '',
      repliedAt: this.repliedAt || null,
      reported: Boolean(this.reportedAt),
      createdAt: this.createdAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, reportedAt: this.reportedAt || null, reportReason: this.reportReason || '' };
  }

  async save(tx) {
    await persistReview(this, tx);
    return this;
  }
}

function reviewFromRow(row) {
  return new PgReview({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    orderId: row.service_orders?.legacy_mongo_id || '',
    materialOrderId: row.material_orders?.legacy_mongo_id || '',
    orderCode: row.material_orders?.order_code || row.service_orders?.order_code || '',
    orderStatus: row.material_orders?.status || row.service_orders?.status || '',
    customerId: row.users_reviews_customer_user_idTousers?.legacy_mongo_id || '',
    targetUserId: row.users_reviews_target_user_idTousers?.legacy_mongo_id || '',
    targetType: row.target_type,
    rating: row.rating,
    comment: row.comment || '',
    images: (row.review_media || []).map((item) => item.file_url),
    contractorReply: row.contractor_reply || '',
    repliedAt: row.replied_at,
    reportedAt: row.reported_at,
    reportReason: row.report_reason || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allReviews() {
  return (await prisma.reviews.findMany({ include: reviewInclude })).map(reviewFromRow);
}

async function persistReview(doc, tx) {
  const db = client(tx);
  const customer = await userId(doc.customerId, tx);
  const target = await userId(doc.targetUserId, tx);
  let serviceOrderId = null;
  let materialOrderId = null;
  if (doc.materialOrderId) {
    const materialOrder = await db.material_orders.findFirst({
      where: { legacy_mongo_id: legacyOf(doc.materialOrderId) },
      select: { id: true },
    });
    if (!materialOrder || !customer || !target) throw new Error('Review material order or party is not in PostgreSQL');
    materialOrderId = materialOrder.id;
  } else {
    const order = await db.service_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.orderId) }, select: { id: true } });
    if (!order || !customer || !target) throw new Error('Review order or party is not in PostgreSQL');
    serviceOrderId = order.id;
  }
  const data = {
    service_order_id: serviceOrderId,
    material_order_id: materialOrderId,
    customer_user_id: customer,
    target_user_id: target,
    target_type: doc.targetType,
    rating: Math.round(num(doc.rating)),
    comment: text(doc.comment, 1000),
    contractor_reply: text(doc.contractorReply, 500),
    replied_at: doc.repliedAt || null,
    reported_at: doc.reportedAt || null,
    report_reason: text(doc.reportReason, 500),
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.reviews.update({ where: { id: doc.pgId }, data })
    : await db.reviews.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  await db.review_media.deleteMany({ where: { review_id: row.id } });
  for (let index = 0; index < (doc.images || []).length; index += 1) {
    if (!doc.images[index]) continue;
    await db.review_media.create({ data: { review_id: row.id, file_url: doc.images[index], sort_order: index } });
  }
}

const complaintInclude = {
  service_orders: { select: { legacy_mongo_id: true } },
  users_complaints_created_by_user_idTousers: { select: { legacy_mongo_id: true } },
  users_complaints_against_user_idTousers: { select: { legacy_mongo_id: true } },
  users_complaints_admin_user_idTousers: { select: { legacy_mongo_id: true } },
  complaint_attachments: { orderBy: { sort_order: 'asc' } },
};

class PgComplaint {
  constructor(data) {
    Object.assign(this, data);
    this.attachments = [...(data.attachments || [])];
  }

  toPublic() {
    return {
      id: this._id,
      orderId: legacyOf(this.orderId),
      createdBy: legacyOf(this.createdBy),
      againstUser: legacyOf(this.againstUser),
      reason: this.reason,
      description: this.description,
      attachments: this.attachments,
      status: this.status,
      adminNote: this.adminNote || '',
      adminId: this.adminId || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id };
  }

  async save(tx) {
    await persistComplaint(this, tx);
    return this;
  }
}

function complaintFromRow(row) {
  return new PgComplaint({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    orderId: row.service_orders?.legacy_mongo_id || '',
    createdBy: row.users_complaints_created_by_user_idTousers?.legacy_mongo_id || '',
    againstUser: row.users_complaints_against_user_idTousers?.legacy_mongo_id || '',
    reason: row.reason,
    description: row.description,
    attachments: (row.complaint_attachments || []).map((item) => item.file_url),
    status: row.status,
    adminNote: row.admin_note || '',
    adminId: row.users_complaints_admin_user_idTousers?.legacy_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allComplaints() {
  return (await prisma.complaints.findMany({ include: complaintInclude })).map(complaintFromRow);
}

async function persistComplaint(doc, tx) {
  const db = client(tx);
  const order = await db.service_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.orderId) }, select: { id: true } });
  const createdBy = await userId(doc.createdBy, tx);
  const against = await userId(doc.againstUser, tx);
  if (!order || !createdBy || !against) throw new Error('Complaint order or party is not in PostgreSQL');
  const admin = doc.adminId ? await userId(doc.adminId, tx) : null;
  const data = {
    service_order_id: order.id,
    created_by_user_id: createdBy,
    against_user_id: against,
    reason: text(doc.reason, 80),
    description: text(doc.description, 2000),
    status: doc.status || 'OPEN',
    admin_note: text(doc.adminNote, 2000),
    admin_user_id: admin,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.complaints.update({ where: { id: doc.pgId }, data })
    : await db.complaints.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  doc.updatedAt = row.updated_at;
  await db.complaint_attachments.deleteMany({ where: { complaint_id: row.id } });
  for (let index = 0; index < (doc.attachments || []).length; index += 1) {
    if (!doc.attachments[index]) continue;
    await db.complaint_attachments.create({
      data: { complaint_id: row.id, file_url: doc.attachments[index], sort_order: index },
    });
  }
}

function link(value, relation) {
  const id = legacyClause(value);
  if (id == null) return null;
  return relation ? { [relation]: { legacy_mongo_id: id } } : { legacy_mongo_id: id };
}

function orderWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    const relation = {
      customerId: 'users_service_orders_customer_user_idTousers',
      contractorId: 'users_service_orders_contractor_user_idTousers',
      quotationId: 'quotations',
      requestId: 'repair_requests',
      storeId: 'stores',
    }[key];
    if (relation || key === '_id') {
      const part = link(value, relation);
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'status' || key === 'paymentStatus') {
      const status = enumClause(value);
      if (status == null) return null;
      where[key === 'status' ? 'status' : 'payment_status'] = status;
    } else {
      return null;
    }
  }
  return where;
}

function reviewWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    const relation = {
      customerId: 'users_reviews_customer_user_idTousers',
      targetUserId: 'users_reviews_target_user_idTousers',
      orderId: 'service_orders',
    }[key];
    if (relation || key === '_id') {
      const part = link(value, relation);
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'targetType' && typeof value === 'string') {
      where.target_type = value;
    } else {
      return null;
    }
  }
  return where;
}

function model(loader, Factory, scope) {
  async function rowsFor(filter, state) {
    if (scope) {
      const where = scope.where(filter);
      if (where) return scope.rows(where, state);
    }
    return (await loader()).filter((row) => matches(row, filter));
  }
  return {
    find(filter = {}) {
      return chain(async (state) => rowsFor(filter, state));
    },
    findOne(filter = {}) {
      const query = this.find(filter);
      const exec = query.then.bind(query);
      query.then = (resolve, reject) => exec((rows) => resolve(rows[0] || null), reject);
      query.catch = (reject) => Promise.resolve(query).catch(reject);
      return query;
    },
    findById(id) {
      return this.findOne({ _id: id });
    },
    async create(data, tx) {
      try {
        const doc = new Factory({ ...data, _id: data._id });
        await doc.save(tx);
        return doc;
      } catch (err) {
        markDuplicate(err);
      }
    },
    async countDocuments(filter = {}) {
      if (scope?.count) {
        const where = scope.where(filter);
        if (where) return scope.count(where);
      }
      return (await loader()).filter((row) => matches(row, filter)).length;
    },
    async findByIdAndUpdate(id, update, tx) {
      const doc = await this.findById(id);
      if (!doc) return null;
      Object.assign(doc, update?.$set || update);
      await doc.save(tx);
      return doc;
    },
    async updateMany(filter, update, tx) {
      const rows = (await loader()).filter((row) => matches(row, filter));
      const data = update?.$set || update;
      for (const row of rows) {
        Object.assign(row, data);
        await row.save(tx);
      }
      return { modifiedCount: rows.length };
    },
    async aggregate(pipeline) {
      const rows = (await loader()).map((row) => (row.toPlain ? row.toPlain() : { ...row }));
      return runPipeline(rows, pipeline);
    },
  };
}

const Payment = model(allPayments, PgPayment);
Payment.listByOrder = async function listByOrder(orderId, tx) {
  if (!tx) return this.find({ orderId });
  const rows = await tx.payments.findMany({
    where: { service_orders: { legacy_mongo_id: legacyOf(orderId) } },
    include: paymentInclude,
  });
  return rows.map(paymentFromRow);
};

async function runInTransaction(work) {
  const { runInTransaction: runPg } = require('./pgContext');
  return runPg(work);
}

module.exports = {
  Order: model(allOrders, PgOrder, {
    where: orderWhere,
    rows: (where, state) => prisma.service_orders.findMany({
      where,
      include: orderInclude,
      orderBy: state?.sort?.createdAt < 0 ? { created_at: 'desc' } : undefined,
      take: state?.limit > 0 ? state.limit : undefined,
    }).then((rows) => rows.map(orderFromRow)),
    count: (where) => prisma.service_orders.count({ where }),
  }),
  Payment,
  CommissionRule: model(allRules, PgRule),
  Commission: model(allCommissions, PgCommission),
  ProgressUpdate: model(allProgress, PgProgress),
  Review: model(allReviews, PgReview, {
    where: reviewWhere,
    rows: async (where, state) => {
      const rows = await prisma.reviews.findMany({
        where,
        include: reviewInclude,
        orderBy: state?.sort?.createdAt < 0 ? { created_at: 'desc' } : undefined,
        take: state?.limit > 0 ? state.limit : undefined,
      });
      return rows.map(reviewFromRow);
    },
    count: (where) => prisma.reviews.count({ where }),
  }),
  Complaint: model(allComplaints, PgComplaint),
  runInTransaction,
};
