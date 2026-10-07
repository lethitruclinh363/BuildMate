const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections, asBool } = require('../lib/connections');
const { loadPublicSchema } = require('../lib/schema');
const {
  ident, oid, text, dateOrNull, numeric, jsonbValue, column, requireColumn,
  setColumn, requireTable, unfilledRequired, insertRow, loadLegacyMap, coordinates,
} = require('../lib/rows');

const MESSAGE_TYPES = new Set(['TEXT', 'IMAGE', 'VIDEO', 'QUOTATION', 'LOCATION']);
const QUOTE_ITEM_TYPES = new Set(['MATERIAL', 'LABOR']);
const QUOTATION_STATUSES = new Set(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'MODIFICATION_REQUEST']);
const ORDER_STATUSES = new Set(['REQUEST_CREATED', 'QUOTATION_SENT', 'QUOTATION_ACCEPTED', 'DEPOSIT_PAID', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'CUSTOMER_ACCEPTED', 'CANCELLED']);
const PAYMENT_STATUSES = new Set(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED']);
const PAYMENT_TYPES = new Set(['FULL_PAYMENT', 'DEPOSIT', 'FINAL_PAYMENT']);
const PROGRESS_STATUSES = new Set(['STARTED', 'IN_PROGRESS', 'COMPLETED']);
const REVIEW_TARGETS = new Set(['CONTRACTOR', 'MATERIAL_STORE']);
const COMPLAINT_STATUSES = new Set(['OPEN', 'PROCESSING', 'RESOLVED', 'REJECTED']);
const MATERIAL_ORDER_STATUSES = new Set(['PENDING_PAYMENT', 'DEPOSIT_PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'DELIVERING', 'DELIVERED', 'CUSTOMER_RECEIVED', 'COMPLETED', 'CANCELLED']);
const MATERIAL_ACTORS = new Set(['CUSTOMER', 'STORE', 'SYSTEM']);
const COMMISSION_STATUSES = new Set(['POSTED', 'REVERSED']);
const POLICY_TYPES = new Set(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CUSTOMER_POLICY', 'CONTRACTOR_POLICY', 'MATERIAL_STORE_POLICY', 'PAYMENT_POLICY', 'REFUND_POLICY', 'COMMUNITY_GUIDELINE']);
const POLICY_STATUSES = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const NOTIFICATION_TYPES = new Set(['REQUEST', 'MESSAGE', 'QUOTATION', 'QUOTATION_ACCEPTED', 'QUOTATION_REJECTED', 'QUOTATION_MODIFY', 'STATUS_UPDATE', 'ORDER_CREATED', 'PROGRESS_UPDATED', 'ORDER_COMPLETED', 'CONTRACTOR_ACCEPTED_JOB', 'CONTRACTOR_STARTED_JOB', 'CONTRACTOR_UPDATED_PROGRESS', 'CONTRACTOR_COMPLETED_JOB', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'COMMISSION_CREATED', 'NEW_REVIEW', 'NEW_COMPLAINT', 'COMPLAINT_UPDATED']);
const AUDIT_ACTIONS = new Set(['ADMIN_APPROVE', 'ADMIN_REJECT', 'QUOTATION_SENT', 'QUOTATION_ACCEPTED', 'QUOTATION_REJECTED', 'QUOTATION_MODIFY', 'REQUEST_STATUS', 'PROFILE_UPDATE', 'PASSWORD_CHANGE', 'AVATAR_UPDATE', 'ORDER_CREATED', 'PROGRESS_UPDATED', 'ORDER_COMPLETED', 'PAYMENT_CREATED', 'PAYMENT_PAID', 'PAYMENT_REFUNDED', 'COMMISSION_CREATED', 'REVIEW_CREATED', 'REVIEW_REPORTED', 'COMPLAINT_CREATED', 'COMPLAINT_RESOLVED', 'FEE_CHANGED', 'POLICY_UPDATED']);

const PARENTS = [
  ['repairrequests', 'repair_requests'],
  ['chatrooms', 'chat_rooms'],
  ['messages', 'messages'],
  ['quotations', 'quotations'],
  ['orders', 'service_orders'],
  ['payments', 'payments'],
  ['commissionrules', 'commission_rules'],
  ['commissions', 'commissions'],
  ['progressupdates', 'progress_updates'],
  ['reviews', 'reviews'],
  ['complaints', 'complaints'],
  ['materialOrders', 'material_orders'],
  ['materialOrderPayments', 'material_order_payments'],
  ['materialCommissions', 'material_commissions'],
  ['notifications', 'notifications'],
  ['policies', 'policies'],
  ['policyrevisions', 'policy_revisions'],
  ['auditlogs', 'audit_logs'],
  ['locationcorrections', 'location_corrections'],
];

const REPAIR_DEFAULT = { lng: 105.746, lat: 10.045 };

function vnd(value) {
  return Math.round(Number(value) || 0);
}

function exactEnum(value, allowed, label, fallback = null) {
  if (value == null || value === '') return fallback;
  const out = String(value);
  if (!allowed.has(out)) throw new Error(`${label}: value "${out}" is not in the source enum`);
  return out;
}

function guard(schema, table, row) {
  const missing = unfilledRequired(schema, table, row);
  if (missing.length) throw new Error(`${table} is missing required columns: ${missing.join(', ')}`);
}

function putTime(schema, table, row, doc, withUpdated = true) {
  setColumn(schema, table, row, ['created_at'], dateOrNull(doc.createdAt) || new Date());
  if (withUpdated) setColumn(schema, table, row, ['updated_at'], dateOrNull(doc.updatedAt) || dateOrNull(doc.createdAt) || new Date());
}

function repairPoint(doc) {
  const point = coordinates(doc);
  if (!point) return null;
  if (!doc.locationConfirmed && point.lat === REPAIR_DEFAULT.lat && point.lng === REPAIR_DEFAULT.lng) return null;
  return point;
}

function deliveryPoint(doc) {
  const coords = doc?.deliveryLocation?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function insertLocation(pg, schema, point, confirmed, createdAt, updatedAt) {
  requireTable(schema, 'locations');
  const row = {};
  setColumn(schema, 'locations', row, ['latitude'], point.lat);
  setColumn(schema, 'locations', row, ['longitude'], point.lng);
  setColumn(schema, 'locations', row, ['is_confirmed', 'location_confirmed'], Boolean(confirmed));
  setColumn(schema, 'locations', row, ['created_at'], createdAt || new Date());
  setColumn(schema, 'locations', row, ['updated_at'], updatedAt || createdAt || new Date());
  guard(schema, 'locations', row);
  return insertRow(pg, 'locations', row);
}

async function addChild(pg, schema, table, row, counts, key) {
  guard(schema, table, row);
  await insertRow(pg, table, row);
  counts[key] += 1;
}

function validate(source) {
  const problems = [];
  const codes = new Set();
  const quoteIds = new Set();
  const requestOrders = new Set();
  const roomRequests = new Set();
  const paymentKeys = new Set();
  const commissionPayments = new Set();
  const materialCodes = new Set();
  const materialPayOrders = new Set();
  const materialCommissionPays = new Set();
  const addresses = new Set();
  const reviewKeys = new Set();

  for (const doc of source.orders) {
    if (codes.has(doc.orderCode)) problems.push(`duplicate service orderCode ${doc.orderCode}`);
    codes.add(doc.orderCode);
    const quote = oid(doc.quotationId);
    const request = oid(doc.requestId);
    if (quoteIds.has(quote)) problems.push(`duplicate order quotation ${quote}`);
    if (requestOrders.has(request)) problems.push(`duplicate order repair request ${request}`);
    quoteIds.add(quote);
    requestOrders.add(request);
  }
  for (const doc of source.rooms) {
    const request = oid(doc.requestId);
    if (roomRequests.has(request)) problems.push(`duplicate chat room for repair request ${request}`);
    roomRequests.add(request);
  }
  for (const doc of source.payments) {
    const key = `${oid(doc.orderId)}:${doc.type || 'FULL_PAYMENT'}`;
    if (paymentKeys.has(key)) problems.push(`duplicate payment ${key}`);
    paymentKeys.add(key);
  }
  for (const doc of source.commissions) {
    const key = oid(doc.paymentId);
    if (commissionPayments.has(key)) problems.push(`duplicate commission payment ${key}`);
    commissionPayments.add(key);
  }
  for (const doc of source.materialOrders) {
    if (materialCodes.has(doc.orderCode)) problems.push(`duplicate material orderCode ${doc.orderCode}`);
    materialCodes.add(doc.orderCode);
    if (vnd(doc.materialSubtotal) + vnd(doc.shippingFee) !== vnd(doc.totalAmount)) {
      problems.push(`material order ${oid(doc._id)} totalAmount is not subtotal + shipping`);
    }
    if (vnd(doc.depositAmount) + vnd(doc.remainingAmount) !== vnd(doc.totalAmount)) {
      problems.push(`material order ${oid(doc._id)} deposit + remaining is not total`);
    }
    for (const item of doc.items || []) {
      if (vnd(item.priceSnapshot) * Number(item.quantity) !== vnd(item.lineTotal)) {
        problems.push(`material order ${oid(doc._id)} line total does not match price snapshot * quantity`);
      }
    }
  }
  for (const doc of source.materialPayments) {
    const key = oid(doc.materialOrderId);
    if (materialPayOrders.has(key)) problems.push(`duplicate material payment for ${key}`);
    materialPayOrders.add(key);
  }
  for (const doc of source.materialCommissions) {
    const key = oid(doc.materialOrderPaymentId);
    if (materialCommissionPays.has(key)) problems.push(`duplicate material commission payment ${key}`);
    materialCommissionPays.add(key);
  }
  for (const doc of source.quotations) {
    if (vnd(doc.materialCost) + vnd(doc.laborCost) + vnd(doc.transportCost) !== vnd(doc.totalCost)) {
      problems.push(`quotation ${oid(doc._id)} totalCost is not material + labor + transport`);
    }
  }
  const paymentsById = new Map(source.payments.map((doc) => [oid(doc._id), doc]));
  for (const doc of source.commissions) {
    const payment = paymentsById.get(oid(doc.paymentId));
    if (!payment) problems.push(`commission ${oid(doc._id)} payment is missing in Mongo`);
    else if (vnd(doc.platformAmount) + vnd(doc.contractorAmount) !== vnd(payment.amount)) {
      problems.push(`commission ${oid(doc._id)} amounts do not add up to the payment`);
    }
  }
  const materialOrdersById = new Map(source.materialOrders.map((doc) => [oid(doc._id), doc]));
  for (const doc of source.materialCommissions) {
    const order = materialOrdersById.get(oid(doc.materialOrderId));
    if (!order) problems.push(`material commission ${oid(doc._id)} order is missing`);
    else if (vnd(doc.platformAmount) !== vnd(order.platformFeeAmount) || vnd(doc.storeAmount) !== vnd(order.storeDepositAmount)) {
      problems.push(`material commission ${oid(doc._id)} does not match the order fee snapshot`);
    }
  }
  for (const doc of source.corrections) {
    const key = String(doc.normalizedAddress || '');
    if (addresses.has(key)) problems.push(`duplicate location correction address`);
    addresses.add(key);
  }
  for (const doc of source.reviews) {
    const key = `${oid(doc.orderId)}:${oid(doc.customerId)}:${oid(doc.targetUserId)}:${doc.targetType}`;
    if (reviewKeys.has(key)) problems.push(`duplicate review ${key}`);
    reviewKeys.add(key);
  }
  for (const doc of source.messages) {
    if (doc.type && !MESSAGE_TYPES.has(doc.type)) problems.push(`message ${oid(doc._id)} has unsupported type ${doc.type}`);
  }
  return problems;
}

async function migratedCount(pg) {
  let total = 0;
  for (const [, table] of PARENTS) {
    const result = await pg.query(`SELECT COUNT(*)::int AS count FROM public.${ident(table)} WHERE legacy_mongo_id IS NOT NULL`);
    total += result.rows[0].count;
  }
  return total;
}

async function main() {
  let pg;
  let schema;
  try {
    const mongo = await connectMongo();
    const source = {};
    const mongoCounts = {};
    for (const [collection] of PARENTS) {
      source[collection] = await mongo.db.collection(collection).find({}).sort({ _id: 1 }).toArray();
      mongoCounts[collection] = source[collection].length;
    }
    console.log(`Mongo transactional counts: ${JSON.stringify(mongoCounts)}`);
    const named = {
      repairs: source.repairrequests,
      rooms: source.chatrooms,
      messages: source.messages,
      quotations: source.quotations,
      orders: source.orders,
      payments: source.payments,
      rules: source.commissionrules,
      commissions: source.commissions,
      progress: source.progressupdates,
      reviews: source.reviews,
      complaints: source.complaints,
      materialOrders: source.materialOrders,
      materialPayments: source.materialOrderPayments,
      materialCommissions: source.materialCommissions,
      notifications: source.notifications,
      policies: source.policies,
      revisions: source.policyrevisions,
      audits: source.auditlogs,
      corrections: source.locationcorrections,
    };
    const problems = validate(named);
    if (problems.length) {
      throw new Error(`Source validation failed. PostgreSQL was not changed.\n- ${problems.slice(0, 40).join('\n- ')}`);
    }

    pg = await connectPostgres();
    schema = await loadPublicSchema(pg);
    for (const [, table] of PARENTS) requireTable(schema, table);
    for (const table of ['repair_request_media', 'quotation_items', 'progress_media', 'material_order_items', 'material_order_status_history']) {
      requireTable(schema, table);
    }
    for (const [, table] of PARENTS) requireColumn(schema, table, ['legacy_mongo_id'], 'legacy_mongo_id');
    if (schema.chat_participants && column(schema, 'chat_rooms', ['customer_id', 'customer_user_id'])) {
      console.log('chat_rooms stores customer and contractor. chat_participants will not be filled.');
    }

    const existing = await migratedCount(pg);
    if (existing > 0 && !asBool(process.env.MIGRATION_ALLOW_NONEMPTY, false)) {
      throw new Error(`PostgreSQL already has ${existing} transactional legacy row(s). Refusing to rerun without MIGRATION_ALLOW_NONEMPTY=true.`);
    }

    const users = await loadLegacyMap(pg, 'users');
    const stores = await loadLegacyMap(pg, 'stores');
    const materials = await loadLegacyMap(pg, 'materials');
    const catalog = await loadLegacyMap(pg, 'catalog_services');
    const codeCol = column(schema, 'catalog_services', ['code', 'catalog_key']);
    const catalogByCode = new Map();
    if (codeCol) {
      const codes = await pg.query(`SELECT id, ${ident(codeCol)} AS code FROM public.catalog_services WHERE ${ident(codeCol)} IS NOT NULL AND ${ident(codeCol)} <> ''`);
      for (const row of codes.rows) catalogByCode.set(String(row.code), row.id);
    }
    const must = (map, id, label) => {
      const key = oid(id);
      if (!key) throw new Error(`${label}: missing reference`);
      const found = map.get(key);
      if (!found) throw new Error(`${label}: Mongo ${key} is not in PostgreSQL legacy_mongo_id`);
      return found;
    };
    const resolveCatalog = (raw) => {
      const value = text(raw);
      if (!value) return null;
      if (catalog.has(value)) return catalog.get(value);
      return catalogByCode.get(value) || null;
    };

    const counts = {};
    const map = {};
    for (const [, table] of PARENTS) {
      counts[table] = 0;
      map[table] = {};
    }
    for (const key of ['repair_request_media', 'quotation_items', 'progress_media', 'review_images', 'complaint_attachments', 'material_order_items', 'material_order_status_history', 'locations']) {
      counts[key] = 0;
    }

    console.log('Migrating transactional data...');
    await pg.query('BEGIN');

    for (const doc of named.repairs) {
      const mongoId = oid(doc._id);
      const point = repairPoint(doc);
      const locationId = point ? await insertLocation(pg, schema, point, doc.locationConfirmed === true, dateOrNull(doc.createdAt), dateOrNull(doc.updatedAt)) : null;
      if (locationId) counts.locations += 1;
      const linked = resolveCatalog(doc.catalogServiceId);
      if (text(doc.catalogServiceId) && !linked) {
        throw new Error(`repair ${mongoId}: catalogServiceId ${text(doc.catalogServiceId)} has no catalog row`);
      }
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'repair_requests', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `repair ${mongoId} customer`));
      setColumn(schema, 'repair_requests', row, ['contractor_id', 'contractor_user_id'], must(users, doc.contractorId, `repair ${mongoId} contractor`));
      if (oid(doc.storeId)) setColumn(schema, 'repair_requests', row, ['store_id'], must(stores, doc.storeId, `repair ${mongoId} store`));
      setColumn(schema, 'repair_requests', row, ['catalog_service_id'], linked);
      setColumn(schema, 'repair_requests', row, ['catalog_service_key', 'catalog_key'], text(doc.catalogServiceId));
      setColumn(schema, 'repair_requests', row, ['category'], text(doc.category));
      setColumn(schema, 'repair_requests', row, ['service_name'], text(doc.serviceName));
      setColumn(schema, 'repair_requests', row, ['title'], text(doc.title));
      setColumn(schema, 'repair_requests', row, ['description'], text(doc.description));
      setColumn(schema, 'repair_requests', row, ['address'], text(doc.address));
      setColumn(schema, 'repair_requests', row, ['location_id'], locationId);
      setColumn(schema, 'repair_requests', row, ['location_confirmed'], Boolean(doc.locationConfirmed));
      setColumn(schema, 'repair_requests', row, ['location_source'], text(doc.locationSource));
      setColumn(schema, 'repair_requests', row, ['location_confirmed_at'], dateOrNull(doc.locationConfirmedAt));
      setColumn(schema, 'repair_requests', row, ['status'], exactEnum(doc.status, new Set(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED']), `repair ${mongoId}`, 'PENDING'));
      putTime(schema, 'repair_requests', row, doc);
      guard(schema, 'repair_requests', row);
      const id = await insertRow(pg, 'repair_requests', row);
      map.repair_requests[mongoId] = id;
      counts.repair_requests += 1;
      let index = 0;
      for (const url of doc.images || []) {
        const child = {};
        setColumn(schema, 'repair_request_media', child, ['repair_request_id', 'request_id'], id);
        setColumn(schema, 'repair_request_media', child, ['media_type', 'kind', 'type'], 'IMAGE');
        setColumn(schema, 'repair_request_media', child, ['url', 'file_url', 'image_url'], text(url));
        setColumn(schema, 'repair_request_media', child, ['sort_order', 'position'], index);
        if (text(url)) await addChild(pg, schema, 'repair_request_media', child, counts, 'repair_request_media');
        index += 1;
      }
      for (const url of doc.videos || []) {
        const child = {};
        setColumn(schema, 'repair_request_media', child, ['repair_request_id', 'request_id'], id);
        setColumn(schema, 'repair_request_media', child, ['media_type', 'kind', 'type'], 'VIDEO');
        setColumn(schema, 'repair_request_media', child, ['url', 'file_url', 'image_url'], text(url));
        setColumn(schema, 'repair_request_media', child, ['sort_order', 'position'], index);
        if (text(url)) await addChild(pg, schema, 'repair_request_media', child, counts, 'repair_request_media');
        index += 1;
      }
    }

    for (const doc of named.rooms) {
      const mongoId = oid(doc._id);
      const requestId = map.repair_requests[oid(doc.requestId)];
      if (!requestId) throw new Error(`chat room ${mongoId}: repair request was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'chat_rooms', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `room ${mongoId} customer`));
      setColumn(schema, 'chat_rooms', row, ['contractor_id', 'contractor_user_id'], must(users, doc.contractorId, `room ${mongoId} contractor`));
      setColumn(schema, 'chat_rooms', row, ['repair_request_id', 'request_id'], requestId);
      setColumn(schema, 'chat_rooms', row, ['last_message'], text(doc.lastMessage));
      setColumn(schema, 'chat_rooms', row, ['last_message_at'], dateOrNull(doc.lastMessageAt));
      putTime(schema, 'chat_rooms', row, doc);
      guard(schema, 'chat_rooms', row);
      map.chat_rooms[mongoId] = await insertRow(pg, 'chat_rooms', row);
      counts.chat_rooms += 1;
    }

    for (const doc of named.quotations) {
      const mongoId = oid(doc._id);
      const requestId = map.repair_requests[oid(doc.requestId)];
      if (!requestId) throw new Error(`quotation ${mongoId}: repair request was not migrated`);
      const roomKey = oid(doc.roomId);
      if (roomKey && !map.chat_rooms[roomKey]) throw new Error(`quotation ${mongoId}: chat room was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'quotations', row, ['repair_request_id', 'request_id'], requestId);
      setColumn(schema, 'quotations', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `quotation ${mongoId} customer`));
      setColumn(schema, 'quotations', row, ['contractor_id', 'contractor_user_id'], must(users, doc.contractorId, `quotation ${mongoId} contractor`));
      setColumn(schema, 'quotations', row, ['chat_room_id', 'room_id'], roomKey ? map.chat_rooms[roomKey] : null);
      setColumn(schema, 'quotations', row, ['material_cost'], numeric(doc.materialCost || 0));
      setColumn(schema, 'quotations', row, ['labor_cost'], numeric(doc.laborCost || 0));
      setColumn(schema, 'quotations', row, ['transport_cost'], numeric(doc.transportCost || 0));
      setColumn(schema, 'quotations', row, ['total_cost'], numeric(doc.totalCost || 0));
      setColumn(schema, 'quotations', row, ['estimated_days'], Number(doc.estimatedDays || 1));
      setColumn(schema, 'quotations', row, ['note'], text(doc.note));
      setColumn(schema, 'quotations', row, ['modification_note'], text(doc.modificationNote));
      setColumn(schema, 'quotations', row, ['status'], exactEnum(doc.status, QUOTATION_STATUSES, `quotation ${mongoId}`, 'SENT'));
      putTime(schema, 'quotations', row, doc);
      guard(schema, 'quotations', row);
      const id = await insertRow(pg, 'quotations', row);
      map.quotations[mongoId] = id;
      counts.quotations += 1;
      for (let index = 0; index < (doc.items || []).length; index += 1) {
        const item = doc.items[index];
        const child = {};
        setColumn(schema, 'quotation_items', child, ['quotation_id'], id);
        setColumn(schema, 'quotation_items', child, ['item_type', 'type'], exactEnum(item.type, QUOTE_ITEM_TYPES, `quotation ${mongoId} item`));
        setColumn(schema, 'quotation_items', child, ['name'], text(item.name));
        setColumn(schema, 'quotation_items', child, ['quantity'], numeric(item.quantity ?? 1));
        setColumn(schema, 'quotation_items', child, ['unit'], text(item.unit));
        setColumn(schema, 'quotation_items', child, ['price'], numeric(item.price));
        const catalogId = oid(item.catalogId);
        if (catalogId && catalog.has(catalogId)) setColumn(schema, 'quotation_items', child, ['catalog_service_id'], catalog.get(catalogId));
        else if (catalogId && materials.has(catalogId)) setColumn(schema, 'quotation_items', child, ['material_id'], materials.get(catalogId));
        else if (catalogId) throw new Error(`quotation ${mongoId}: item catalogId ${catalogId} matches neither catalog service nor material`);
        setColumn(schema, 'quotation_items', child, ['sort_order', 'position'], index);
        await addChild(pg, schema, 'quotation_items', child, counts, 'quotation_items');
      }
    }

    for (const doc of named.messages) {
      const mongoId = oid(doc._id);
      const roomId = map.chat_rooms[oid(doc.roomId)];
      if (!roomId) throw new Error(`message ${mongoId}: chat room was not migrated`);
      const quoteKey = oid(doc.quotationId);
      if (quoteKey && !map.quotations[quoteKey]) throw new Error(`message ${mongoId}: quotation was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'messages', row, ['chat_room_id', 'room_id'], roomId);
      setColumn(schema, 'messages', row, ['sender_id', 'sender_user_id'], must(users, doc.senderId, `message ${mongoId} sender`));
      setColumn(schema, 'messages', row, ['message_type', 'type'], exactEnum(doc.type, MESSAGE_TYPES, `message ${mongoId}`, 'TEXT'));
      setColumn(schema, 'messages', row, ['content', 'body'], doc.content == null ? null : String(doc.content));
      setColumn(schema, 'messages', row, ['quotation_id'], quoteKey ? map.quotations[quoteKey] : null);
      setColumn(schema, 'messages', row, ['is_read', 'read'], Boolean(doc.read));
      const lat = numOr(doc.location?.lat);
      const lng = numOr(doc.location?.lng);
      if (lat != null && lng != null) {
        const placed = setColumn(schema, 'messages', row, ['latitude'], lat) && setColumn(schema, 'messages', row, ['longitude'], lng);
        setColumn(schema, 'messages', row, ['location_address', 'address'], text(doc.location?.address));
        setColumn(schema, 'messages', row, ['location_label', 'label'], text(doc.location?.label));
        if (!placed && doc.type === 'LOCATION') {
          const locationId = await insertLocation(pg, schema, { lat, lng }, true, dateOrNull(doc.createdAt), dateOrNull(doc.updatedAt));
          if (!setColumn(schema, 'messages', row, ['location_id'], locationId)) {
            throw new Error(`message ${mongoId}: LOCATION has no latitude/longitude or location_id column`);
          }
          counts.locations += 1;
        }
      }
      putTime(schema, 'messages', row, doc);
      guard(schema, 'messages', row);
      map.messages[mongoId] = await insertRow(pg, 'messages', row);
      counts.messages += 1;
    }

    for (const doc of named.orders) {
      const mongoId = oid(doc._id);
      const point = repairPoint(doc);
      const locationId = point ? await insertLocation(pg, schema, point, false, dateOrNull(doc.createdAt), dateOrNull(doc.updatedAt)) : null;
      if (locationId) counts.locations += 1;
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'service_orders', row, ['order_code'], text(doc.orderCode));
      setColumn(schema, 'service_orders', row, ['quotation_id'], map.quotations[oid(doc.quotationId)]);
      setColumn(schema, 'service_orders', row, ['repair_request_id', 'request_id'], map.repair_requests[oid(doc.requestId)]);
      if (!map.quotations[oid(doc.quotationId)] || !map.repair_requests[oid(doc.requestId)]) {
        throw new Error(`service order ${mongoId}: quotation or repair request was not migrated`);
      }
      setColumn(schema, 'service_orders', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `order ${mongoId} customer`));
      setColumn(schema, 'service_orders', row, ['contractor_id', 'contractor_user_id'], must(users, doc.contractorId, `order ${mongoId} contractor`));
      if (oid(doc.storeId)) setColumn(schema, 'service_orders', row, ['store_id'], must(stores, doc.storeId, `order ${mongoId} store`));
      setColumn(schema, 'service_orders', row, ['title'], text(doc.title));
      setColumn(schema, 'service_orders', row, ['description'], text(doc.description));
      setColumn(schema, 'service_orders', row, ['location_id'], locationId);
      setColumn(schema, 'service_orders', row, ['amount'], numeric(doc.amount));
      setColumn(schema, 'service_orders', row, ['status'], exactEnum(doc.status, ORDER_STATUSES, `order ${mongoId}`));
      setColumn(schema, 'service_orders', row, ['payment_status'], exactEnum(doc.paymentStatus, PAYMENT_STATUSES, `order ${mongoId} payment`, 'UNPAID'));
      setColumn(schema, 'service_orders', row, ['cancel_reason'], text(doc.cancelReason));
      if (oid(doc.cancelledBy)) setColumn(schema, 'service_orders', row, ['cancelled_by', 'cancelled_by_user_id'], must(users, doc.cancelledBy, `order ${mongoId} cancelledBy`));
      setColumn(schema, 'service_orders', row, ['cancelled_at'], dateOrNull(doc.cancelledAt));
      setColumn(schema, 'service_orders', row, ['completed_at'], dateOrNull(doc.completedAt));
      putTime(schema, 'service_orders', row, doc);
      guard(schema, 'service_orders', row);
      map.service_orders[mongoId] = await insertRow(pg, 'service_orders', row);
      counts.service_orders += 1;
    }

    for (const doc of named.payments) {
      const mongoId = oid(doc._id);
      const orderId = map.service_orders[oid(doc.orderId)];
      if (!orderId) throw new Error(`payment ${mongoId}: service order was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'payments', row, ['service_order_id', 'order_id'], orderId);
      setColumn(schema, 'payments', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `payment ${mongoId} customer`));
      setColumn(schema, 'payments', row, ['contractor_id', 'contractor_user_id'], must(users, doc.contractorId, `payment ${mongoId} contractor`));
      setColumn(schema, 'payments', row, ['amount'], numeric(doc.amount));
      setColumn(schema, 'payments', row, ['payment_type', 'type'], exactEnum(doc.type, PAYMENT_TYPES, `payment ${mongoId}`, 'FULL_PAYMENT'));
      setColumn(schema, 'payments', row, ['status'], exactEnum(doc.status, PAYMENT_STATUSES, `payment ${mongoId}`, 'UNPAID'));
      setColumn(schema, 'payments', row, ['provider'], text(doc.provider));
      setColumn(schema, 'payments', row, ['transaction_code'], text(doc.transactionCode));
      const metaCol = column(schema, 'payments', ['metadata', 'meta']);
      if (metaCol) row[metaCol] = jsonbValue(schema, 'payments', metaCol, doc.metadata || {});
      else if (doc.metadata && Object.keys(doc.metadata).length) throw new Error(`payment ${mongoId}: metadata has no jsonb column`);
      setColumn(schema, 'payments', row, ['paid_at'], dateOrNull(doc.paidAt));
      setColumn(schema, 'payments', row, ['refunded_at'], dateOrNull(doc.refundedAt));
      setColumn(schema, 'payments', row, ['failed_at'], dateOrNull(doc.failedAt));
      putTime(schema, 'payments', row, doc);
      guard(schema, 'payments', row);
      map.payments[mongoId] = await insertRow(pg, 'payments', row);
      counts.payments += 1;
    }

    for (const doc of named.rules) {
      const mongoId = oid(doc._id);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'commission_rules', row, ['name'], text(doc.name));
      setColumn(schema, 'commission_rules', row, ['percentage', 'rate'], numeric(doc.percentage));
      setColumn(schema, 'commission_rules', row, ['active', 'is_active'], Boolean(doc.active));
      putTime(schema, 'commission_rules', row, doc);
      guard(schema, 'commission_rules', row);
      map.commission_rules[mongoId] = await insertRow(pg, 'commission_rules', row);
      counts.commission_rules += 1;
    }

    for (const doc of named.commissions) {
      const mongoId = oid(doc._id);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'commissions', row, ['payment_id'], map.payments[oid(doc.paymentId)]);
      setColumn(schema, 'commissions', row, ['service_order_id', 'order_id'], map.service_orders[oid(doc.orderId)]);
      if (!map.payments[oid(doc.paymentId)] || !map.service_orders[oid(doc.orderId)]) {
        throw new Error(`commission ${mongoId}: payment or service order was not migrated`);
      }
      setColumn(schema, 'commissions', row, ['contractor_id', 'contractor_user_id'], must(users, doc.contractorId, `commission ${mongoId}`));
      setColumn(schema, 'commissions', row, ['rate_snapshot'], numeric(doc.rateSnapshot));
      setColumn(schema, 'commissions', row, ['platform_amount'], numeric(doc.platformAmount));
      setColumn(schema, 'commissions', row, ['contractor_amount'], numeric(doc.contractorAmount));
      setColumn(schema, 'commissions', row, ['status'], exactEnum(doc.status, COMMISSION_STATUSES, `commission ${mongoId}`, 'POSTED'));
      putTime(schema, 'commissions', row, doc);
      guard(schema, 'commissions', row);
      map.commissions[mongoId] = await insertRow(pg, 'commissions', row);
      counts.commissions += 1;
    }

    for (const doc of named.progress) {
      const mongoId = oid(doc._id);
      const orderId = map.service_orders[oid(doc.orderId)];
      if (!orderId) throw new Error(`progress ${mongoId}: service order was not migrated`);
      const point = coordinates(doc);
      const locationId = point ? await insertLocation(pg, schema, point, false, dateOrNull(doc.createdAt), dateOrNull(doc.createdAt)) : null;
      if (locationId) counts.locations += 1;
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'progress_updates', row, ['service_order_id', 'order_id'], orderId);
      setColumn(schema, 'progress_updates', row, ['status'], exactEnum(doc.status, PROGRESS_STATUSES, `progress ${mongoId}`));
      setColumn(schema, 'progress_updates', row, ['description'], text(doc.description));
      if (oid(doc.actorId)) setColumn(schema, 'progress_updates', row, ['actor_id', 'actor_user_id'], must(users, doc.actorId, `progress ${mongoId} actor`));
      setColumn(schema, 'progress_updates', row, ['location_id'], locationId);
      setColumn(schema, 'progress_updates', row, ['created_at'], dateOrNull(doc.createdAt) || new Date());
      guard(schema, 'progress_updates', row);
      const id = await insertRow(pg, 'progress_updates', row);
      map.progress_updates[mongoId] = id;
      counts.progress_updates += 1;
      for (let index = 0; index < (doc.images || []).length; index += 1) {
        const url = text(doc.images[index]);
        if (!url) continue;
        const child = {};
        setColumn(schema, 'progress_media', child, ['progress_update_id', 'progress_id'], id);
        setColumn(schema, 'progress_media', child, ['url', 'file_url', 'image_url'], url);
        setColumn(schema, 'progress_media', child, ['sort_order', 'position'], index);
        await addChild(pg, schema, 'progress_media', child, counts, 'progress_media');
      }
    }

    const reviewImageTable = ['review_images', 'review_media'].find((name) => schema[name]);
    for (const doc of named.reviews) {
      const mongoId = oid(doc._id);
      const orderId = map.service_orders[oid(doc.orderId)];
      if (!orderId) throw new Error(`review ${mongoId}: service order was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'reviews', row, ['service_order_id', 'order_id'], orderId);
      setColumn(schema, 'reviews', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `review ${mongoId} customer`));
      setColumn(schema, 'reviews', row, ['target_user_id', 'target_id'], must(users, doc.targetUserId, `review ${mongoId} target`));
      setColumn(schema, 'reviews', row, ['target_type'], exactEnum(doc.targetType, REVIEW_TARGETS, `review ${mongoId}`));
      setColumn(schema, 'reviews', row, ['rating'], Number(doc.rating));
      setColumn(schema, 'reviews', row, ['comment'], text(doc.comment));
      setColumn(schema, 'reviews', row, ['contractor_reply', 'reply'], text(doc.contractorReply));
      setColumn(schema, 'reviews', row, ['replied_at'], dateOrNull(doc.repliedAt));
      setColumn(schema, 'reviews', row, ['reported_at'], dateOrNull(doc.reportedAt));
      setColumn(schema, 'reviews', row, ['report_reason'], text(doc.reportReason));
      putTime(schema, 'reviews', row, doc);
      guard(schema, 'reviews', row);
      const id = await insertRow(pg, 'reviews', row);
      map.reviews[mongoId] = id;
      counts.reviews += 1;
      for (let index = 0; index < (doc.images || []).length; index += 1) {
        const url = text(doc.images[index]);
        if (!url) continue;
        if (!reviewImageTable) throw new Error(`review ${mongoId} has images but neither review_images nor review_media exists`);
        const child = {};
        setColumn(schema, reviewImageTable, child, ['review_id'], id);
        setColumn(schema, reviewImageTable, child, ['url', 'file_url', 'image_url'], url);
        setColumn(schema, reviewImageTable, child, ['sort_order', 'position'], index);
        await addChild(pg, schema, reviewImageTable, child, counts, 'review_images');
      }
    }

    const complaintFileTable = ['complaint_attachments', 'complaint_media'].find((name) => schema[name]);
    for (const doc of named.complaints) {
      const mongoId = oid(doc._id);
      const orderId = map.service_orders[oid(doc.orderId)];
      if (!orderId) throw new Error(`complaint ${mongoId}: service order was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'complaints', row, ['service_order_id', 'order_id'], orderId);
      setColumn(schema, 'complaints', row, ['created_by', 'created_by_user_id'], must(users, doc.createdBy, `complaint ${mongoId} createdBy`));
      setColumn(schema, 'complaints', row, ['against_user_id', 'against_user'], must(users, doc.againstUser, `complaint ${mongoId} againstUser`));
      setColumn(schema, 'complaints', row, ['reason'], text(doc.reason));
      setColumn(schema, 'complaints', row, ['description'], text(doc.description));
      setColumn(schema, 'complaints', row, ['status'], exactEnum(doc.status, COMPLAINT_STATUSES, `complaint ${mongoId}`, 'OPEN'));
      setColumn(schema, 'complaints', row, ['admin_note'], text(doc.adminNote));
      if (oid(doc.adminId)) setColumn(schema, 'complaints', row, ['admin_id', 'admin_user_id'], must(users, doc.adminId, `complaint ${mongoId} admin`));
      putTime(schema, 'complaints', row, doc);
      guard(schema, 'complaints', row);
      const id = await insertRow(pg, 'complaints', row);
      map.complaints[mongoId] = id;
      counts.complaints += 1;
      for (let index = 0; index < (doc.attachments || []).length; index += 1) {
        const url = text(doc.attachments[index]);
        if (!url) continue;
        if (!complaintFileTable) throw new Error(`complaint ${mongoId} has attachments but neither complaint_attachments nor complaint_media exists`);
        const child = {};
        setColumn(schema, complaintFileTable, child, ['complaint_id'], id);
        setColumn(schema, complaintFileTable, child, ['url', 'file_url'], url);
        setColumn(schema, complaintFileTable, child, ['sort_order', 'position'], index);
        await addChild(pg, schema, complaintFileTable, child, counts, 'complaint_attachments');
      }
    }

    for (const doc of named.materialOrders) {
      const mongoId = oid(doc._id);
      const point = deliveryPoint(doc);
      if (!point) throw new Error(`material order ${mongoId}: delivery location is missing or invalid`);
      const locationId = await insertLocation(pg, schema, point, doc.locationConfirmed === true, dateOrNull(doc.createdAt), dateOrNull(doc.updatedAt));
      counts.locations += 1;
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'material_orders', row, ['order_code'], text(doc.orderCode));
      setColumn(schema, 'material_orders', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `material order ${mongoId} customer`));
      setColumn(schema, 'material_orders', row, ['store_id'], must(stores, doc.storeId, `material order ${mongoId} store`));
      setColumn(schema, 'material_orders', row, ['store_owner_id', 'store_owner_user_id'], must(users, doc.storeOwnerId, `material order ${mongoId} owner`));
      setColumn(schema, 'material_orders', row, ['delivery_address', 'address'], text(doc.deliveryAddress));
      setColumn(schema, 'material_orders', row, ['location_id', 'delivery_location_id'], locationId);
      setColumn(schema, 'material_orders', row, ['location_confirmed'], Boolean(doc.locationConfirmed));
      setColumn(schema, 'material_orders', row, ['location_source'], text(doc.locationSource));
      setColumn(schema, 'material_orders', row, ['location_confirmed_at'], dateOrNull(doc.locationConfirmedAt));
      setColumn(schema, 'material_orders', row, ['distance_km'], numeric(doc.distanceKm));
      setColumn(schema, 'material_orders', row, ['material_subtotal'], numeric(doc.materialSubtotal));
      setColumn(schema, 'material_orders', row, ['shipping_fee'], numeric(doc.shippingFee));
      setColumn(schema, 'material_orders', row, ['total_amount'], numeric(doc.totalAmount));
      setColumn(schema, 'material_orders', row, ['deposit_rate_snapshot'], numeric(doc.depositRateSnapshot));
      setColumn(schema, 'material_orders', row, ['deposit_amount'], numeric(doc.depositAmount));
      setColumn(schema, 'material_orders', row, ['platform_fee_rate_snapshot'], numeric(doc.platformFeeRateSnapshot));
      setColumn(schema, 'material_orders', row, ['platform_fee_amount'], numeric(doc.platformFeeAmount));
      setColumn(schema, 'material_orders', row, ['store_deposit_amount'], numeric(doc.storeDepositAmount));
      setColumn(schema, 'material_orders', row, ['remaining_amount'], numeric(doc.remainingAmount));
      setColumn(schema, 'material_orders', row, ['payment_status'], exactEnum(doc.paymentStatus, PAYMENT_STATUSES, `material order ${mongoId} payment`, 'UNPAID'));
      setColumn(schema, 'material_orders', row, ['status'], exactEnum(doc.status, MATERIAL_ORDER_STATUSES, `material order ${mongoId}`, 'PENDING_PAYMENT'));
      setColumn(schema, 'material_orders', row, ['customer_note'], text(doc.customerNote));
      setColumn(schema, 'material_orders', row, ['remaining_settled_offline'], Boolean(doc.remainingSettledOffline));
      setColumn(schema, 'material_orders', row, ['remaining_settled_at'], dateOrNull(doc.remainingSettledAt));
      putTime(schema, 'material_orders', row, doc);
      guard(schema, 'material_orders', row);
      const id = await insertRow(pg, 'material_orders', row);
      map.material_orders[mongoId] = id;
      counts.material_orders += 1;
      for (let index = 0; index < (doc.items || []).length; index += 1) {
        const item = doc.items[index];
        const child = {};
        setColumn(schema, 'material_order_items', child, ['material_order_id', 'order_id'], id);
        setColumn(schema, 'material_order_items', child, ['material_id'], must(materials, item.materialId, `material order ${mongoId} item`));
        setColumn(schema, 'material_order_items', child, ['name_snapshot', 'name'], text(item.nameSnapshot));
        setColumn(schema, 'material_order_items', child, ['image_snapshot', 'image_url'], text(item.imageSnapshot));
        setColumn(schema, 'material_order_items', child, ['unit_snapshot', 'unit'], text(item.unitSnapshot));
        setColumn(schema, 'material_order_items', child, ['price_snapshot', 'price'], numeric(item.priceSnapshot));
        setColumn(schema, 'material_order_items', child, ['quantity'], numeric(item.quantity));
        setColumn(schema, 'material_order_items', child, ['line_total'], numeric(item.lineTotal));
        setColumn(schema, 'material_order_items', child, ['sort_order', 'position'], index);
        await addChild(pg, schema, 'material_order_items', child, counts, 'material_order_items');
      }
      for (let index = 0; index < (doc.statusHistory || []).length; index += 1) {
        const entry = doc.statusHistory[index];
        const child = {};
        setColumn(schema, 'material_order_status_history', child, ['material_order_id', 'order_id'], id);
        setColumn(schema, 'material_order_status_history', child, ['status'], exactEnum(entry.status, MATERIAL_ORDER_STATUSES, `material order ${mongoId} history`));
        if (oid(entry.actorId)) setColumn(schema, 'material_order_status_history', child, ['actor_id', 'actor_user_id'], must(users, entry.actorId, `material order ${mongoId} history actor`));
        setColumn(schema, 'material_order_status_history', child, ['actor_role'], exactEnum(entry.actorRole, MATERIAL_ACTORS, `material order ${mongoId} history role`));
        setColumn(schema, 'material_order_status_history', child, ['note'], text(entry.note));
        setColumn(schema, 'material_order_status_history', child, ['created_at'], dateOrNull(entry.createdAt) || new Date());
        setColumn(schema, 'material_order_status_history', child, ['sort_order', 'position'], index);
        await addChild(pg, schema, 'material_order_status_history', child, counts, 'material_order_status_history');
      }
    }

    for (const doc of named.materialPayments) {
      const mongoId = oid(doc._id);
      const orderId = map.material_orders[oid(doc.materialOrderId)];
      if (!orderId) throw new Error(`material payment ${mongoId}: order was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'material_order_payments', row, ['material_order_id', 'order_id'], orderId);
      setColumn(schema, 'material_order_payments', row, ['customer_id', 'customer_user_id'], must(users, doc.customerId, `material payment ${mongoId} customer`));
      setColumn(schema, 'material_order_payments', row, ['store_owner_id', 'store_owner_user_id'], must(users, doc.storeOwnerId, `material payment ${mongoId} owner`));
      setColumn(schema, 'material_order_payments', row, ['amount'], numeric(doc.amount));
      setColumn(schema, 'material_order_payments', row, ['platform_fee_amount'], numeric(doc.platformFeeAmount));
      setColumn(schema, 'material_order_payments', row, ['store_deposit_amount'], numeric(doc.storeDepositAmount));
      setColumn(schema, 'material_order_payments', row, ['status'], exactEnum(doc.status, PAYMENT_STATUSES, `material payment ${mongoId}`, 'UNPAID'));
      setColumn(schema, 'material_order_payments', row, ['provider'], text(doc.provider));
      setColumn(schema, 'material_order_payments', row, ['transaction_code'], text(doc.transactionCode));
      const metaCol = column(schema, 'material_order_payments', ['metadata', 'meta']);
      if (metaCol) row[metaCol] = jsonbValue(schema, 'material_order_payments', metaCol, doc.metadata || {});
      else if (doc.metadata && Object.keys(doc.metadata).length) throw new Error(`material payment ${mongoId}: metadata has no jsonb column`);
      setColumn(schema, 'material_order_payments', row, ['paid_at'], dateOrNull(doc.paidAt));
      putTime(schema, 'material_order_payments', row, doc);
      guard(schema, 'material_order_payments', row);
      map.material_order_payments[mongoId] = await insertRow(pg, 'material_order_payments', row);
      counts.material_order_payments += 1;
    }

    for (const doc of named.materialCommissions) {
      const mongoId = oid(doc._id);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'material_commissions', row, ['material_order_payment_id', 'payment_id'], map.material_order_payments[oid(doc.materialOrderPaymentId)]);
      setColumn(schema, 'material_commissions', row, ['material_order_id', 'order_id'], map.material_orders[oid(doc.materialOrderId)]);
      if (!map.material_order_payments[oid(doc.materialOrderPaymentId)] || !map.material_orders[oid(doc.materialOrderId)]) {
        throw new Error(`material commission ${mongoId}: payment or order was not migrated`);
      }
      setColumn(schema, 'material_commissions', row, ['store_owner_id', 'store_owner_user_id'], must(users, doc.storeOwnerId, `material commission ${mongoId}`));
      setColumn(schema, 'material_commissions', row, ['rate_snapshot'], numeric(doc.rateSnapshot));
      setColumn(schema, 'material_commissions', row, ['platform_amount'], numeric(doc.platformAmount));
      setColumn(schema, 'material_commissions', row, ['store_amount'], numeric(doc.storeAmount));
      setColumn(schema, 'material_commissions', row, ['status'], exactEnum(doc.status, COMMISSION_STATUSES, `material commission ${mongoId}`, 'POSTED'));
      putTime(schema, 'material_commissions', row, doc);
      guard(schema, 'material_commissions', row);
      map.material_commissions[mongoId] = await insertRow(pg, 'material_commissions', row);
      counts.material_commissions += 1;
    }

    for (const doc of named.policies) {
      const mongoId = oid(doc._id);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'policies', row, ['title'], text(doc.title));
      setColumn(schema, 'policies', row, ['policy_type', 'type'], exactEnum(doc.type, POLICY_TYPES, `policy ${mongoId}`));
      setColumn(schema, 'policies', row, ['content'], doc.content == null ? null : String(doc.content));
      setColumn(schema, 'policies', row, ['language'], exactEnum(doc.language, new Set(['vi', 'en']), `policy ${mongoId}`));
      setColumn(schema, 'policies', row, ['version'], text(doc.version));
      setColumn(schema, 'policies', row, ['status'], exactEnum(doc.status, POLICY_STATUSES, `policy ${mongoId}`, 'DRAFT'));
      setColumn(schema, 'policies', row, ['effective_date', 'effective_at'], dateOrNull(doc.effectiveDate));
      if (oid(doc.createdBy)) setColumn(schema, 'policies', row, ['created_by', 'created_by_user_id'], must(users, doc.createdBy, `policy ${mongoId} creator`));
      putTime(schema, 'policies', row, doc);
      guard(schema, 'policies', row);
      map.policies[mongoId] = await insertRow(pg, 'policies', row);
      counts.policies += 1;
    }

    for (const doc of named.revisions) {
      const mongoId = oid(doc._id);
      const policyId = map.policies[oid(doc.policyId)];
      if (!policyId) throw new Error(`policy revision ${mongoId}: policy was not migrated`);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'policy_revisions', row, ['policy_id'], policyId);
      setColumn(schema, 'policy_revisions', row, ['title'], text(doc.title));
      setColumn(schema, 'policy_revisions', row, ['policy_type', 'type'], exactEnum(doc.type, POLICY_TYPES, `revision ${mongoId}`));
      setColumn(schema, 'policy_revisions', row, ['content'], doc.content == null ? null : String(doc.content));
      setColumn(schema, 'policy_revisions', row, ['language'], exactEnum(doc.language, new Set(['vi', 'en']), `revision ${mongoId}`));
      setColumn(schema, 'policy_revisions', row, ['version'], text(doc.version));
      setColumn(schema, 'policy_revisions', row, ['status'], exactEnum(doc.status, POLICY_STATUSES, `revision ${mongoId}`));
      setColumn(schema, 'policy_revisions', row, ['effective_date', 'effective_at'], dateOrNull(doc.effectiveDate));
      if (oid(doc.editedBy)) setColumn(schema, 'policy_revisions', row, ['edited_by', 'edited_by_user_id'], must(users, doc.editedBy, `revision ${mongoId} editor`));
      putTime(schema, 'policy_revisions', row, doc);
      guard(schema, 'policy_revisions', row);
      map.policy_revisions[mongoId] = await insertRow(pg, 'policy_revisions', row);
      counts.policy_revisions += 1;
    }

    for (const doc of named.notifications) {
      const mongoId = oid(doc._id);
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'notifications', row, ['user_id', 'recipient_user_id'], must(users, doc.userId, `notification ${mongoId}`));
      setColumn(schema, 'notifications', row, ['title'], text(doc.title));
      setColumn(schema, 'notifications', row, ['message', 'body'], doc.message == null ? null : String(doc.message));
      setColumn(schema, 'notifications', row, ['notification_type', 'type'], exactEnum(doc.type, NOTIFICATION_TYPES, `notification ${mongoId}`));
      setColumn(schema, 'notifications', row, ['is_read', 'read'], Boolean(doc.isRead));
      setColumn(schema, 'notifications', row, ['link'], text(doc.link));
      const metaCol = column(schema, 'notifications', ['meta', 'metadata']);
      if (metaCol) row[metaCol] = jsonbValue(schema, 'notifications', metaCol, doc.meta || {});
      else if (doc.meta && Object.keys(doc.meta).length) throw new Error(`notification ${mongoId}: meta has no jsonb column`);
      putTime(schema, 'notifications', row, doc);
      guard(schema, 'notifications', row);
      map.notifications[mongoId] = await insertRow(pg, 'notifications', row);
      counts.notifications += 1;
    }

    for (const doc of named.audits) {
      const mongoId = oid(doc._id);
      const row = { legacy_mongo_id: mongoId };
      if (oid(doc.actorId)) setColumn(schema, 'audit_logs', row, ['actor_id', 'actor_user_id'], must(users, doc.actorId, `audit ${mongoId}`));
      setColumn(schema, 'audit_logs', row, ['actor_role'], text(doc.actorRole));
      setColumn(schema, 'audit_logs', row, ['action'], exactEnum(doc.action, AUDIT_ACTIONS, `audit ${mongoId}`));
      setColumn(schema, 'audit_logs', row, ['entity_type'], text(doc.entityType));
      const entityCol = column(schema, 'audit_logs', ['entity_id', 'entity_legacy_id']);
      if (entityCol) {
        const meta = schema.audit_logs.columns[entityCol];
        if (meta.dataType === 'bigint' || meta.udtName === 'int8') {
          throw new Error('audit_logs.entity_id is bigint. Source entityId is a string and was not converted.');
        }
        row[entityCol] = doc.entityId == null ? null : String(doc.entityId);
      }
      const metaCol = column(schema, 'audit_logs', ['meta', 'metadata']);
      if (metaCol) row[metaCol] = jsonbValue(schema, 'audit_logs', metaCol, doc.meta || {});
      else if (doc.meta && Object.keys(doc.meta).length) throw new Error(`audit ${mongoId}: meta has no jsonb column`);
      setColumn(schema, 'audit_logs', row, ['ip', 'ip_address'], text(doc.ip));
      putTime(schema, 'audit_logs', row, doc);
      guard(schema, 'audit_logs', row);
      map.audit_logs[mongoId] = await insertRow(pg, 'audit_logs', row);
      counts.audit_logs += 1;
    }

    for (const doc of named.corrections) {
      const mongoId = oid(doc._id);
      const point = coordinates(doc);
      if (!point) throw new Error(`location correction ${mongoId}: coordinates are missing or invalid`);
      const locationId = await insertLocation(pg, schema, point, true, dateOrNull(doc.createdAt), dateOrNull(doc.updatedAt));
      counts.locations += 1;
      const row = { legacy_mongo_id: mongoId };
      setColumn(schema, 'location_corrections', row, ['normalized_address'], text(doc.normalizedAddress));
      setColumn(schema, 'location_corrections', row, ['location_id'], locationId);
      setColumn(schema, 'location_corrections', row, ['provider_ref_id', 'provider_ref'], text(doc.providerRefId));
      setColumn(schema, 'location_corrections', row, ['confirmed_count'], Number(doc.confirmedCount || 0));
      setColumn(schema, 'location_corrections', row, ['last_confirmed_at'], dateOrNull(doc.lastConfirmedAt));
      putTime(schema, 'location_corrections', row, doc);
      guard(schema, 'location_corrections', row);
      map.location_corrections[mongoId] = await insertRow(pg, 'location_corrections', row);
      counts.location_corrections += 1;
    }

    await pg.query('COMMIT');
    const output = path.resolve(__dirname, '../output/transactions-map.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const printable = {};
    for (const [table, pairs] of Object.entries(map)) {
      printable[table] = Object.fromEntries(Object.entries(pairs).map(([key, id]) => [key, String(id)]));
    }
    fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, map: printable }, null, 2)}\n`);
    console.log(JSON.stringify(counts, null, 2));
    console.log('Transactional migration COMMITTED.');
  } catch (err) {
    if (pg) {
      try { await pg.query('ROLLBACK'); } catch (_) {}
    }
    if (schema) {
      const gapPath = path.resolve(__dirname, '../output/transactions-schema-gap.json');
      fs.mkdirSync(path.dirname(gapPath), { recursive: true });
      const interesting = {};
      for (const [name, meta] of Object.entries(schema)) {
        if (/repair|chat|message|quot|order|payment|commission|progress|review|complaint|material|polic|audit|notification|location|service/.test(name)) {
          interesting[name] = { columns: Object.keys(meta.columns), fks: meta.fks };
        }
      }
      fs.writeFileSync(gapPath, `${JSON.stringify({ error: err.message, tables: interesting }, null, 2)}\n`);
    }
    throw err;
  } finally {
    await closeConnections(pg);
  }
}

function numOr(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

main().catch((err) => {
  console.error('\nTransactional migration FAILED:', err.message);
  process.exitCode = 1;
});
