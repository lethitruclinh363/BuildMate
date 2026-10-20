const crypto = require('crypto');
const { db } = require('./pgContext');
const { legacyClause, enumClause } = require('./scopedQuery');
const { describePlace } = require('../utils/geo');
const { generateMaterialOrderCode } = require('../utils/material-order.rules');

function newId() {
  return crypto.randomBytes(12).toString('hex');
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

function money(value, scale = 2) {
  return num(value).toFixed(scale);
}

function timeOf(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isOperator(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && typeof value.toHexString !== 'function'
  );
}

function matchValue(actual, expected) {
  if (isOperator(expected)) {
    if (expected.$in) return expected.$in.map((item) => legacyOf(item)).includes(legacyOf(actual));
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) return legacyOf(actual) !== legacyOf(expected.$ne);
    if (Object.prototype.hasOwnProperty.call(expected, '$eq')) return String(evalPlain(expected.$eq)) === String(actual);
    return false;
  }
  return legacyOf(actual) === legacyOf(expected);
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => matchValue(doc[key], value));
}

function sortRows(rows, spec) {
  const keys = Object.entries(spec || {});
  return [...rows].sort((left, right) => {
    for (const [key, direction] of keys) {
      const delta = (timeOf(left[key]) || 0) - (timeOf(right[key]) || 0);
      if (delta) return direction < 0 ? -delta : delta;
    }
    return 0;
  });
}

function chain(loader) {
  const state = { sort: null, limit: null };
  const exec = async () => {
    let rows = await loader(state);
    if (state.sort) rows = sortRows(rows, state.sort);
    if (state.limit != null) rows = rows.slice(0, state.limit);
    return rows;
  };
  const query = {
    sort(value) { state.sort = value; return query; },
    limit(value) { state.limit = Number(value); return query; },
    select() { return query; },
    then(resolve, reject) { return exec().then(resolve, reject); },
  };
  return query;
}

function markDuplicate(err) {
  if (err?.code === 'P2002') err.code = 11000;
  throw err;
}

function evalPlain(expr, row) {
  if (typeof expr === 'string' && expr.startsWith('$')) return row[expr.slice(1)];
  if (expr && expr.$cond) {
    const [test, yes, no] = expr.$cond;
    return testCond(test, row) ? evalPlain(yes, row) : evalPlain(no, row);
  }
  return expr;
}

function testCond(test, row) {
  if (test?.$in) return test.$in[1].map(String).includes(String(evalPlain(test.$in[0], row)));
  if (test?.$eq) return String(evalPlain(test.$eq[0], row)) === String(evalPlain(test.$eq[1], row));
  return false;
}

function aggregate(rows, pipeline) {
  let current = rows.map((row) => (row.toPlain ? row.toPlain() : row));
  for (const stage of pipeline) {
    if (stage.$match) current = current.filter((row) => matches(row, stage.$match));
    else if (stage.$group) {
      const groups = new Map();
      for (const row of current) {
        const id = evalPlain(stage.$group._id, row);
        const key = String(id);
        if (!groups.has(key)) groups.set(key, { _id: id });
        const group = groups.get(key);
        for (const [field, acc] of Object.entries(stage.$group)) {
          if (field === '_id') continue;
          group[field] = Number(group[field] || 0) + num(evalPlain(acc.$sum, row));
        }
      }
      current = [...groups.values()];
    }
  }
  return current;
}

async function userId(legacyId) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  const row = await db().users.findFirst({ where: { legacy_mongo_id: id }, select: { id: true } });
  return row?.id || null;
}

const orderInclude = {
  locations: true,
  stores: { select: { legacy_mongo_id: true } },
  users_material_orders_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_material_orders_store_owner_user_idTousers: { select: { legacy_mongo_id: true } },
  material_order_items: { include: { materials: { select: { legacy_mongo_id: true } } }, orderBy: { sort_order: 'asc' } },
  material_order_status_history: {
    include: { users: { select: { legacy_mongo_id: true } } },
    orderBy: { created_at: 'asc' },
  },
};

class PgMaterialOrder {
  constructor(data) {
    Object.assign(this, data);
    this.items = [...(data.items || [])];
    this.statusHistory = [...(data.statusHistory || [])];
    this.distanceKm = num(data.distanceKm);
    this.materialSubtotal = num(data.materialSubtotal);
    this.shippingFee = num(data.shippingFee);
    this.totalAmount = num(data.totalAmount);
    this.depositRateSnapshot = num(data.depositRateSnapshot);
    this.depositAmount = num(data.depositAmount);
    this.platformFeeRateSnapshot = num(data.platformFeeRateSnapshot);
    this.platformFeeAmount = num(data.platformFeeAmount);
    this.storeDepositAmount = num(data.storeDepositAmount);
    this.remainingAmount = num(data.remainingAmount);
  }

  toPublic() {
    return {
      id: this._id,
      orderCode: this.orderCode,
      customerId: legacyOf(this.customerId),
      storeId: legacyOf(this.storeId),
      storeOwnerId: legacyOf(this.storeOwnerId),
      items: this.items.map((item) => ({
        materialId: legacyOf(item.materialId),
        nameSnapshot: item.nameSnapshot,
        imageSnapshot: item.imageSnapshot || '',
        unitSnapshot: item.unitSnapshot || '',
        priceSnapshot: num(item.priceSnapshot),
        quantity: num(item.quantity),
        lineTotal: num(item.lineTotal),
      })),
      deliveryAddress: this.deliveryAddress,
      deliveryLocation: this.deliveryLocation,
      locationConfirmed: Boolean(this.locationConfirmed),
      locationSource: this.locationSource || '',
      locationConfirmedAt: this.locationConfirmedAt || null,
      place: describePlace({ deliveryLocation: this.deliveryLocation, deliveryAddress: this.deliveryAddress }),
      distanceKm: this.distanceKm,
      materialSubtotal: this.materialSubtotal,
      shippingFee: this.shippingFee,
      totalAmount: this.totalAmount,
      depositRateSnapshot: this.depositRateSnapshot,
      depositAmount: this.depositAmount,
      platformFeeRateSnapshot: this.platformFeeRateSnapshot,
      platformFeeAmount: this.platformFeeAmount,
      storeDepositAmount: this.storeDepositAmount,
      remainingAmount: this.remainingAmount,
      paymentStatus: this.paymentStatus,
      status: this.status,
      statusHistory: this.statusHistory.map((entry) => ({
        status: entry.status,
        actorId: entry.actorId ? legacyOf(entry.actorId) : null,
        actorRole: entry.actorRole,
        note: entry.note || '',
        createdAt: entry.createdAt,
      })),
      customerNote: this.customerNote || '',
      remainingSettledOffline: Boolean(this.remainingSettledOffline),
      remainingSettledAt: this.remainingSettledAt || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id };
  }

  async save() {
    await persistOrder(this);
    return this;
  }
}

function orderFromRow(row) {
  const location = row.locations;
  return new PgMaterialOrder({
    pgId: row.id,
    locationPgId: row.delivery_location_id,
    _id: row.legacy_mongo_id,
    orderCode: row.order_code,
    customerId: row.users_material_orders_customer_user_idTousers?.legacy_mongo_id || '',
    storeId: row.stores?.legacy_mongo_id || '',
    storeOwnerId: row.users_material_orders_store_owner_user_idTousers?.legacy_mongo_id || '',
    items: (row.material_order_items || []).map((item) => ({
      materialId: item.materials?.legacy_mongo_id || '',
      nameSnapshot: item.name_snapshot,
      imageSnapshot: item.image_snapshot || '',
      unitSnapshot: item.unit_snapshot || '',
      priceSnapshot: num(item.price_snapshot),
      quantity: num(item.quantity),
      lineTotal: num(item.line_total),
    })),
    deliveryAddress: location?.formatted_address || '',
    deliveryLocation: location?.latitude == null ? null : {
      type: 'Point',
      coordinates: [num(location.longitude), num(location.latitude)],
    },
    locationConfirmed: Boolean(location?.is_confirmed),
    locationSource: location?.location_source || '',
    locationConfirmedAt: location?.confirmed_at || null,
    distanceKm: row.distance_km,
    materialSubtotal: row.material_subtotal,
    shippingFee: row.shipping_fee,
    totalAmount: row.total_amount,
    depositRateSnapshot: row.deposit_rate_snapshot,
    depositAmount: row.deposit_amount,
    platformFeeRateSnapshot: row.platform_fee_rate_snapshot,
    platformFeeAmount: row.platform_fee_amount,
    storeDepositAmount: row.store_deposit_amount,
    remainingAmount: row.remaining_amount,
    paymentStatus: row.payment_status,
    status: row.status,
    statusHistory: (row.material_order_status_history || []).map((entry) => ({
      status: entry.status,
      actorId: entry.users?.legacy_mongo_id || null,
      actorRole: entry.actor_role,
      note: entry.note || '',
      createdAt: entry.created_at,
    })),
    customerNote: row.customer_note || '',
    remainingSettledOffline: row.remaining_settled_offline,
    remainingSettledAt: row.remaining_settled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allOrders() {
  return (await db().material_orders.findMany({ include: orderInclude })).map(orderFromRow);
}

async function persistOrder(doc) {
  const customer = await userId(doc.customerId);
  const owner = await userId(doc.storeOwnerId);
  const store = await db().stores.findFirst({ where: { legacy_mongo_id: legacyOf(doc.storeId) }, select: { id: true } });
  if (!customer || !owner || !store) throw new Error('Material order party or store is not in PostgreSQL');
  const coordinates = doc.deliveryLocation?.coordinates || [];
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const locationData = {
    formatted_address: text(doc.deliveryAddress, 2000) || null,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    location_source: doc.locationSource || null,
    is_confirmed: Boolean(doc.locationConfirmed),
    confirmed_at: doc.locationConfirmed ? doc.locationConfirmedAt || new Date() : null,
    updated_at: new Date(),
  };
  let locationId = doc.locationPgId || null;
  if (locationId) await db().locations.update({ where: { id: locationId }, data: locationData });
  else {
    const created = await db().locations.create({ data: { ...locationData, created_at: doc.createdAt || new Date() } });
    locationId = created.id;
    doc.locationPgId = locationId;
  }
  const data = {
    order_code: text(doc.orderCode || generateMaterialOrderCode(), 80),
    customer_user_id: customer,
    store_id: store.id,
    store_owner_user_id: owner,
    delivery_location_id: locationId,
    distance_km: money(doc.distanceKm, 3),
    material_subtotal: money(doc.materialSubtotal),
    shipping_fee: money(doc.shippingFee),
    total_amount: money(doc.totalAmount),
    deposit_rate_snapshot: money(doc.depositRateSnapshot),
    deposit_amount: money(doc.depositAmount),
    platform_fee_rate_snapshot: money(doc.platformFeeRateSnapshot),
    platform_fee_amount: money(doc.platformFeeAmount),
    store_deposit_amount: money(doc.storeDepositAmount),
    remaining_amount: money(doc.remainingAmount),
    payment_status: doc.paymentStatus,
    status: doc.status,
    customer_note: text(doc.customerNote, 500),
    remaining_settled_offline: Boolean(doc.remainingSettledOffline),
    remaining_settled_at: doc.remainingSettledAt || null,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db().material_orders.update({ where: { id: doc.pgId }, data })
    : await db().material_orders.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  doc.orderCode = row.order_code;
  await db().material_order_items.deleteMany({ where: { material_order_id: row.id } });
  for (let index = 0; index < doc.items.length; index += 1) {
    const item = doc.items[index];
    const material = await db().materials.findFirst({ where: { legacy_mongo_id: legacyOf(item.materialId) }, select: { id: true } });
    if (!material) throw new Error('Material order item is not in PostgreSQL');
    await db().material_order_items.create({
      data: {
        material_order_id: row.id,
        material_id: material.id,
        name_snapshot: text(item.nameSnapshot, 120),
        image_snapshot: item.imageSnapshot || '',
        unit_snapshot: text(item.unitSnapshot, 50),
        price_snapshot: money(item.priceSnapshot),
        quantity: money(item.quantity, 3),
        line_total: money(item.lineTotal),
        sort_order: index,
      },
    });
  }
  await db().material_order_status_history.deleteMany({ where: { material_order_id: row.id } });
  for (const entry of doc.statusHistory) {
    const actor = entry.actorId ? await userId(entry.actorId) : null;
    await db().material_order_status_history.create({
      data: {
        material_order_id: row.id,
        status: entry.status,
        actor_user_id: actor,
        actor_role: entry.actorRole,
        note: text(entry.note, 500),
        created_at: entry.createdAt || new Date(),
      },
    });
  }
}

function materialOrderWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'customerId') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.users_material_orders_customer_user_idTousers = { legacy_mongo_id: id };
    } else if (key === 'storeOwnerId') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.users_material_orders_store_owner_user_idTousers = { legacy_mongo_id: id };
    } else if (key === 'storeId') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.stores = { legacy_mongo_id: id };
    } else if (key === '_id') {
      const id = legacyClause(value);
      if (id == null) return null;
      where.legacy_mongo_id = id;
    } else if (key === 'status') {
      const status = enumClause(value);
      if (status == null) return null;
      where.status = status;
    } else {
      return null;
    }
  }
  return where;
}

function model(loader, Factory, persist, scope) {
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
      return query;
    },
    findById(id) {
      const query = this.find();
      const exec = query.then.bind(query);
      query.then = (resolve, reject) =>
        exec(
          (rows) =>
            resolve(
              rows.find(
                (r) =>
                  String(r._id) === String(id) ||
                  String(r.pgId) === String(id) ||
                  String(r.id) === String(id) ||
                  r.orderCode === id
              ) || null
            ),
          reject
        );
      return query;
    },
    async create(data) {
      try {
        const doc = new Factory(data);
        await persist(doc);
        return doc;
      } catch (err) {
        markDuplicate(err);
      }
    },
    async findOneAndUpdate(filter, update) {
      const rows = await rowsFor(filter, { limit: 1 });
      const doc = rows[0] || null;
      if (!doc) return null;
      Object.assign(doc, update?.$set || {});
      if (update?.$push?.statusHistory) doc.statusHistory.push(update.$push.statusHistory);
      await doc.save();
      return doc;
    },
    async aggregate(pipeline) {
      return aggregate(await loader(), pipeline);
    },
  };
}

class PgMaterialPayment {
  constructor(data) {
    Object.assign(this, data);
    this.amount = num(data.amount);
    this.platformFeeAmount = num(data.platformFeeAmount);
    this.storeDepositAmount = num(data.storeDepositAmount);
    this.metadata = data.metadata || {};
  }

  toPublic() {
    return {
      id: this._id,
      materialOrderId: legacyOf(this.materialOrderId),
      customerId: legacyOf(this.customerId),
      storeOwnerId: legacyOf(this.storeOwnerId),
      amount: this.amount,
      platformFeeAmount: this.platformFeeAmount,
      storeDepositAmount: this.storeDepositAmount,
      status: this.status,
      provider: this.provider,
      transactionCode: this.transactionCode || null,
      paidAt: this.paidAt || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  async save() {
    await persistPayment(this);
    return this;
  }
}

function paymentFromRow(row) {
  return new PgMaterialPayment({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    materialOrderId: row.material_orders?.legacy_mongo_id || '',
    customerId: row.users_material_order_payments_customer_user_idTousers?.legacy_mongo_id || '',
    storeOwnerId: row.users_material_order_payments_store_owner_user_idTousers?.legacy_mongo_id || '',
    amount: row.amount,
    platformFeeAmount: row.platform_fee_amount,
    storeDepositAmount: row.store_deposit_amount,
    status: row.status,
    provider: row.provider,
    transactionCode: row.transaction_code,
    metadata: row.metadata || {},
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const paymentInclude = {
  material_orders: { select: { legacy_mongo_id: true } },
  users_material_order_payments_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_material_order_payments_store_owner_user_idTousers: { select: { legacy_mongo_id: true } },
};

async function allPayments() {
  return (await db().material_order_payments.findMany({ include: paymentInclude })).map(paymentFromRow);
}

async function persistPayment(doc) {
  const order = await db().material_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.materialOrderId) }, select: { id: true } });
  const customer = await userId(doc.customerId);
  const owner = await userId(doc.storeOwnerId);
  if (!order || !customer || !owner) throw new Error('Material payment order or party is not in PostgreSQL');
  const data = {
    material_order_id: order.id,
    customer_user_id: customer,
    store_owner_user_id: owner,
    amount: money(doc.amount),
    platform_fee_amount: money(doc.platformFeeAmount),
    store_deposit_amount: money(doc.storeDepositAmount),
    status: doc.status,
    provider: text(doc.provider || 'mock', 50),
    transaction_code: doc.transactionCode ? text(doc.transactionCode, 255) : null,
    metadata: doc.metadata || {},
    paid_at: doc.paidAt || null,
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db().material_order_payments.update({ where: { id: doc.pgId }, data })
    : await db().material_order_payments.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id;
}

class PgMaterialCommission {
  constructor(data) {
    Object.assign(this, data);
    this.rateSnapshot = num(data.rateSnapshot);
    this.platformAmount = num(data.platformAmount);
    this.storeAmount = num(data.storeAmount);
  }

  toPublic() {
    return {
      id: this._id,
      materialOrderPaymentId: legacyOf(this.materialOrderPaymentId),
      materialOrderId: legacyOf(this.materialOrderId),
      storeOwnerId: legacyOf(this.storeOwnerId),
      rateSnapshot: this.rateSnapshot,
      platformAmount: this.platformAmount,
      storeAmount: this.storeAmount,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  async save() {
    await persistCommission(this);
    return this;
  }
}

function commissionFromRow(row) {
  return new PgMaterialCommission({
    pgId: row.id,
    _id: row.legacy_mongo_id,
    materialOrderPaymentId: row.material_order_payments?.legacy_mongo_id || '',
    materialOrderId: row.material_orders?.legacy_mongo_id || '',
    storeOwnerId: row.users?.legacy_mongo_id || '',
    rateSnapshot: row.rate_snapshot,
    platformAmount: row.platform_amount,
    storeAmount: row.store_amount,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allCommissions() {
  return (await db().material_commissions.findMany({
    include: {
      material_order_payments: { select: { legacy_mongo_id: true } },
      material_orders: { select: { legacy_mongo_id: true } },
      users: { select: { legacy_mongo_id: true } },
    },
  })).map(commissionFromRow);
}

async function persistCommission(doc) {
  const payment = await db().material_order_payments.findFirst({
    where: { legacy_mongo_id: legacyOf(doc.materialOrderPaymentId) },
    select: { id: true },
  });
  const order = await db().material_orders.findFirst({ where: { legacy_mongo_id: legacyOf(doc.materialOrderId) }, select: { id: true } });
  const owner = await userId(doc.storeOwnerId);
  if (!payment || !order || !owner) throw new Error('Material commission payment or order is not in PostgreSQL');
  const data = {
    material_order_payment_id: payment.id,
    material_order_id: order.id,
    store_owner_user_id: owner,
    rate_snapshot: money(doc.rateSnapshot),
    platform_amount: money(doc.platformAmount),
    store_amount: money(doc.storeAmount),
    status: doc.status || 'POSTED',
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db().material_commissions.update({ where: { id: doc.pgId }, data })
    : await db().material_commissions.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id;
}

module.exports = {
  MaterialOrder: model(allOrders, PgMaterialOrder, persistOrder, {
    where: materialOrderWhere,
    rows: (where, state) => db().material_orders.findMany({
      where,
      include: orderInclude,
      orderBy: state?.sort?.createdAt < 0 ? { created_at: 'desc' } : undefined,
      take: state?.limit > 0 ? state.limit : undefined,
    }).then((rows) => rows.map(orderFromRow)),
  }),
  MaterialOrderPayment: model(allPayments, PgMaterialPayment, persistPayment),
  MaterialCommission: model(allCommissions, PgMaterialCommission, persistCommission),
};
