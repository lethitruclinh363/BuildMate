const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const { legacyClause, enumClause, compareClause } = require('./scopedQuery');

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

function money(value, scale = 2) {
  if (value == null || value === '') return '0.00';
  const raw = String(value);
  if (/^\d+(\.\d+)?$/.test(raw)) return raw;
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(scale) : '0.00';
}

function pointOf(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return { lng: null, lat: null };
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lng: null, lat: null };
  return { lng, lat };
}

function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date) && expected._bsontype !== 'ObjectID') {
    if (expected.$in) return expected.$in.map((item) => legacyOf(item)).includes(legacyOf(actual));
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) return legacyOf(actual) !== legacyOf(expected.$ne);
    if (expected.$lt instanceof Date || (expected.$lt && !Number.isNaN(new Date(expected.$lt).getTime()) && expected.$lt !== '')) {
      return new Date(actual || 0).getTime() < new Date(expected.$lt).getTime();
    }
    if (expected.$gt !== undefined && typeof expected.$gt !== 'object') return Number(actual) > Number(expected.$gt);
    return false;
  }
  return legacyOf(actual) === legacyOf(expected);
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(doc, part));
    return matchValue(doc[key], value);
  });
}

function sortRows(rows, spec) {
  const keys = Object.entries(spec || {});
  return [...rows].sort((left, right) => {
    for (const [key, direction] of keys) {
      const delta = new Date(left[key] || 0).getTime() - new Date(right[key] || 0).getTime();
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

function client(tx) {
  return tx || prisma;
}

async function userId(legacyId, tx) {
  const id = legacyOf(legacyId);
  if (!id) return null;
  const row = await client(tx).users.findFirst({ where: { legacy_mongo_id: id }, select: { id: true } });
  return row?.id || null;
}

async function catalogRow(key) {
  const value = text(key, 160);
  if (!value) return null;
  return prisma.catalog_services.findFirst({
    where: { OR: [{ legacy_mongo_id: value }, { code: value }] },
  });
}

async function categoryId(name) {
  const label = text(name, 80);
  if (!label) return null;
  const row = await prisma.service_categories.findUnique({ where: { name: label } });
  return row?.id || null;
}

async function saveLocation(currentId, fields, tx) {
  const data = {
    formatted_address: text(fields.address, 2000) || null,
    city: text(fields.label || fields.city, 120) || null,
    latitude: fields.lat == null ? null : fields.lat,
    longitude: fields.lng == null ? null : fields.lng,
    location_source: fields.locationSource || null,
    is_confirmed: Boolean(fields.locationConfirmed),
    confirmed_at: fields.locationConfirmed ? fields.locationConfirmedAt || new Date() : null,
    updated_at: new Date(),
  };
  if (currentId) {
    await client(tx).locations.update({ where: { id: currentId }, data });
    return currentId;
  }
  const created = await client(tx).locations.create({ data: { ...data, created_at: fields.createdAt || new Date() } });
  return created.id;
}

class PgRequest {
  constructor(data) {
    Object.assign(this, data);
    this.images = [...(data.images || [])];
    this.videos = [...(data.videos || [])];
  }

  toPublic() {
    return {
      id: this._id,
      customerId: legacyOf(this.customerId),
      contractorId: legacyOf(this.contractorId),
      storeId: this.storeId ? legacyOf(this.storeId) : null,
      category: this.category,
      serviceName: this.serviceName || '',
      catalogServiceId: this.catalogServiceId || '',
      title: this.title,
      description: this.description,
      images: this.images,
      videos: this.videos,
      address: this.address || '',
      location: this.location,
      locationConfirmed: Boolean(this.locationConfirmed),
      locationSource: this.locationSource || '',
      locationConfirmedAt: this.locationConfirmedAt || null,
      place: this.location ? { lat: pointOf(this.location).lat, lng: pointOf(this.location).lng, address: this.address || '', label: this.address || '' } : null,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, images: this.images, videos: this.videos };
  }

  async save(tx) {
    await persistRequest(this, tx);
    return this;
  }
}

class PgRoom {
  constructor(data) {
    Object.assign(this, data);
  }

  toPublic() {
    return {
      id: this._id,
      customerId: legacyOf(this.customerId),
      contractorId: legacyOf(this.contractorId),
      requestId: legacyOf(this.requestId),
      lastMessage: this.lastMessage || '',
      lastMessageAt: this.lastMessageAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id };
  }

  async save(tx) {
    await persistRoom(this, tx);
    return this;
  }
}

class PgMessage {
  constructor(data) {
    Object.assign(this, data);
  }

  toPublic() {
    const location = this.location && Number.isFinite(Number(this.location.lat)) && Number.isFinite(Number(this.location.lng))
      ? {
          lat: Number(this.location.lat),
          lng: Number(this.location.lng),
          address: this.location.address || '',
          label: this.location.label || '',
        }
      : null;
    return {
      id: this._id,
      roomId: legacyOf(this.roomId),
      senderId: legacyOf(this.senderId),
      type: this.type,
      content: this.content || '',
      location,
      quotationId: this.quotationId ? legacyOf(this.quotationId) : null,
      read: Boolean(this.read),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id };
  }

  async save(tx) {
    await persistMessage(this, tx);
    return this;
  }
}

class PgQuote {
  constructor(data) {
    Object.assign(this, data);
    this.items = [...(data.items || [])];
  }

  toPublic() {
    return {
      id: this._id,
      requestId: legacyOf(this.requestId),
      customerId: legacyOf(this.customerId),
      contractorId: legacyOf(this.contractorId),
      roomId: this.roomId ? legacyOf(this.roomId) : null,
      items: this.items.map((item) => ({
        type: item.type,
        name: item.name,
        quantity: Number(item.quantity),
        unit: item.unit || '',
        price: Number(item.price),
        catalogId: item.catalogId || null,
      })),
      materialCost: Number(this.materialCost || 0),
      laborCost: Number(this.laborCost || 0),
      transportCost: Number(this.transportCost || 0),
      totalCost: Number(this.totalCost || 0),
      estimatedDays: Number(this.estimatedDays || 1),
      note: this.note || '',
      modificationNote: this.modificationNote || '',
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toPlain() {
    return { ...this.toPublic(), _id: this._id, items: this.items };
  }

  async save(tx) {
    await persistQuote(this, tx);
    return this;
  }
}

const requestInclude = {
  locations: true,
  repair_request_media: true,
  stores: { select: { legacy_mongo_id: true } },
  catalog_services: { select: { legacy_mongo_id: true, code: true } },
  users_repair_requests_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_repair_requests_contractor_user_idTousers: { select: { legacy_mongo_id: true } },
};

function requestFromRow(row) {
  const media = [...(row.repair_request_media || [])].sort((a, b) => a.sort_order - b.sort_order);
  const lat = row.locations?.latitude == null ? null : Number(row.locations.latitude);
  const lng = row.locations?.longitude == null ? null : Number(row.locations.longitude);
  return new PgRequest({
    pgId: row.id,
    locationPgId: row.location_id,
    _id: row.legacy_mongo_id || String(row.id),
    customerId: row.users_repair_requests_customer_user_idTousers?.legacy_mongo_id || '',
    contractorId: row.users_repair_requests_contractor_user_idTousers?.legacy_mongo_id || '',
    storeId: row.stores?.legacy_mongo_id || null,
    category: row.category_snapshot || '',
    serviceName: row.service_name_snapshot || '',
    catalogServiceId: row.catalog_services?.code || row.catalog_services?.legacy_mongo_id || '',
    title: row.title,
    description: row.description,
    images: media.filter((item) => item.media_type === 'IMAGE').map((item) => item.file_url),
    videos: media.filter((item) => item.media_type === 'VIDEO').map((item) => item.file_url),
    address: row.locations?.formatted_address || '',
    location: lat == null || lng == null ? { type: 'Point', coordinates: [105.746, 10.045] } : { type: 'Point', coordinates: [lng, lat] },
    locationConfirmed: Boolean(row.locations?.is_confirmed),
    locationSource: row.locations?.location_source || '',
    locationConfirmedAt: row.locations?.confirmed_at || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allRequests() {
  return (await prisma.repair_requests.findMany({ include: requestInclude })).map(requestFromRow);
}

function roomFromRow(row) {
  return new PgRoom({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    customerId: row.users_chat_rooms_customer_user_idTousers?.legacy_mongo_id || '',
    contractorId: row.users_chat_rooms_contractor_user_idTousers?.legacy_mongo_id || '',
    requestId: row.repair_requests?.legacy_mongo_id || '',
    lastMessage: row.last_message || '',
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allRooms() {
  return (await prisma.chat_rooms.findMany({
    include: {
      users_chat_rooms_customer_user_idTousers: { select: { legacy_mongo_id: true } },
      users_chat_rooms_contractor_user_idTousers: { select: { legacy_mongo_id: true } },
      repair_requests: { select: { legacy_mongo_id: true } },
    },
  })).map(roomFromRow);
}

function messageFromRow(row) {
  const lat = row.locations?.latitude == null ? null : Number(row.locations.latitude);
  const lng = row.locations?.longitude == null ? null : Number(row.locations.longitude);
  return new PgMessage({
    pgId: row.id,
    locationPgId: row.location_id,
    _id: row.legacy_mongo_id || String(row.id),
    roomId: row.chat_rooms?.legacy_mongo_id || '',
    senderId: row.users?.legacy_mongo_id || '',
    type: row.message_type,
    content: row.content || '',
    location: lat == null || lng == null ? null : {
      lat,
      lng,
      address: row.locations?.formatted_address || '',
      label: row.locations?.city || '',
    },
    quotationId: row.quotations?.legacy_mongo_id || null,
    read: row.is_read,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allMessages() {
  return (await prisma.messages.findMany({ include: messageInclude })).map(messageFromRow);
}

function quoteFromRow(row) {
  return new PgQuote({
    pgId: row.id,
    _id: row.legacy_mongo_id || String(row.id),
    requestId: row.repair_requests?.legacy_mongo_id || '',
    customerId: row.users_quotations_customer_user_idTousers?.legacy_mongo_id || '',
    contractorId: row.users_quotations_contractor_user_idTousers?.legacy_mongo_id || '',
    roomId: row.chat_rooms?.legacy_mongo_id || null,
    items: [...(row.quotation_items || [])].sort((a, b) => a.sort_order - b.sort_order).map((item) => ({
      type: item.item_type,
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      unit: item.unit || '',
      price: Number(item.price),
      catalogId: item.legacy_catalog_reference || null,
    })),
    materialCost: Number(row.material_cost),
    laborCost: Number(row.labor_cost),
    transportCost: Number(row.transport_cost),
    totalCost: Number(row.total_cost),
    estimatedDays: row.estimated_days,
    note: row.note || '',
    modificationNote: row.modification_note || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function allQuotes() {
  return (await prisma.quotations.findMany({ include: quoteInclude })).map(quoteFromRow);
}

async function persistRequest(doc, tx) {
  const db = client(tx);
  const customer = await userId(doc.customerId, tx);
  const contractor = await userId(doc.contractorId, tx);
  if (!customer || !contractor) throw new Error('Repair request customer or contractor is not in PostgreSQL');
  const store = doc.storeId
    ? await db.stores.findFirst({ where: { legacy_mongo_id: legacyOf(doc.storeId) }, select: { id: true } })
    : null;
  const catalog = await catalogRow(doc.catalogServiceId);
  const geo = pointOf(doc.location);
  const locationId = await saveLocation(doc.locationPgId, {
    address: doc.address,
    lat: geo.lat,
    lng: geo.lng,
    locationSource: doc.locationSource || null,
    locationConfirmed: doc.locationConfirmed,
    locationConfirmedAt: doc.locationConfirmedAt,
  }, tx);
  doc.locationPgId = locationId;
  const data = {
    customer_user_id: customer,
    contractor_user_id: contractor,
    store_id: store?.id || null,
    service_category_id: await categoryId(doc.category),
    catalog_service_id: catalog?.id || null,
    category_snapshot: text(doc.category, 80),
    service_name_snapshot: text(doc.serviceName, 80),
    title: text(doc.title, 140),
    description: text(doc.description, 2000),
    location_id: locationId,
    status: doc.status || 'PENDING',
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.repair_requests.update({ where: { id: doc.pgId }, data })
    : await db.repair_requests.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  if (catalog) doc.catalogServiceId = catalog.code || catalog.legacy_mongo_id || doc.catalogServiceId;
  await db.repair_request_media.deleteMany({ where: { repair_request_id: row.id } });
  const media = [
    ...(doc.images || []).map((file) => ({ media_type: 'IMAGE', file_url: file })),
    ...(doc.videos || []).map((file) => ({ media_type: 'VIDEO', file_url: file })),
  ];
  for (let index = 0; index < media.length; index += 1) {
    if (!media[index].file_url) continue;
    await db.repair_request_media.create({
      data: { repair_request_id: row.id, media_type: media[index].media_type, file_url: media[index].file_url, sort_order: index },
    });
  }
}

async function persistRoom(doc, tx) {
  const db = client(tx);
  const customer = await userId(doc.customerId, tx);
  const contractor = await userId(doc.contractorId, tx);
  const request = await db.repair_requests.findFirst({
    where: { legacy_mongo_id: legacyOf(doc.requestId) },
    select: { id: true },
  });
  if (!customer || !contractor || !request) throw new Error('Chat room customer, contractor, or request is not in PostgreSQL');
  const data = {
    customer_user_id: customer,
    contractor_user_id: contractor,
    repair_request_id: request.id,
    last_message: text(doc.lastMessage, 4000),
    last_message_at: doc.lastMessageAt || new Date(),
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.chat_rooms.update({ where: { id: doc.pgId }, data })
    : await db.chat_rooms.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
}

async function persistMessage(doc, tx) {
  const db = client(tx);
  const room = await db.chat_rooms.findFirst({ where: { legacy_mongo_id: legacyOf(doc.roomId) }, select: { id: true } });
  const sender = await userId(doc.senderId, tx);
  if (!room || !sender) throw new Error('Message room or sender is not in PostgreSQL');
  const quote = doc.quotationId
    ? await db.quotations.findFirst({ where: { legacy_mongo_id: legacyOf(doc.quotationId) }, select: { id: true } })
    : null;
  let locationId = doc.locationPgId || null;
  if (doc.location && Number.isFinite(Number(doc.location.lat)) && Number.isFinite(Number(doc.location.lng))) {
    locationId = await saveLocation(locationId, {
      address: doc.location.address,
      label: doc.location.label,
      lat: Number(doc.location.lat),
      lng: Number(doc.location.lng),
      locationConfirmed: true,
      locationConfirmedAt: new Date(),
    }, tx);
    doc.locationPgId = locationId;
  }
  const data = {
    chat_room_id: room.id,
    sender_user_id: sender,
    message_type: doc.type || 'TEXT',
    content: text(doc.content, 4000),
    location_id: locationId,
    quotation_id: quote?.id || null,
    is_read: Boolean(doc.read),
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.messages.update({ where: { id: doc.pgId }, data })
    : await db.messages.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
}

async function persistQuote(doc, tx) {
  const db = client(tx);
  const request = await db.repair_requests.findFirst({ where: { legacy_mongo_id: legacyOf(doc.requestId) }, select: { id: true } });
  const customer = await userId(doc.customerId, tx);
  const contractor = await userId(doc.contractorId, tx);
  if (!request || !customer || !contractor) throw new Error('Quotation request or party is not in PostgreSQL');
  const room = doc.roomId
    ? await db.chat_rooms.findFirst({ where: { legacy_mongo_id: legacyOf(doc.roomId) }, select: { id: true } })
    : null;
  const data = {
    repair_request_id: request.id,
    customer_user_id: customer,
    contractor_user_id: contractor,
    chat_room_id: room?.id || null,
    material_cost: money(doc.materialCost),
    labor_cost: money(doc.laborCost),
    transport_cost: money(doc.transportCost),
    total_cost: money(doc.totalCost),
    estimated_days: Math.min(180, Math.max(1, Number(doc.estimatedDays) || 1)),
    note: text(doc.note, 1000),
    modification_note: text(doc.modificationNote, 1000),
    status: doc.status || 'SENT',
    updated_at: new Date(),
  };
  const row = doc.pgId
    ? await db.quotations.update({ where: { id: doc.pgId }, data })
    : await db.quotations.create({
        data: { ...data, legacy_mongo_id: doc._id || newId(), created_at: doc.createdAt || new Date() },
      });
  doc.pgId = row.id;
  doc._id = row.legacy_mongo_id || doc._id;
  await db.quotation_items.deleteMany({ where: { quotation_id: row.id } });
  for (let index = 0; index < (doc.items || []).length; index += 1) {
    const item = doc.items[index];
    await db.quotation_items.create({
      data: {
        quotation_id: row.id,
        item_type: item.type,
        name_snapshot: text(item.name, 140),
        quantity: money(item.quantity == null ? 1 : item.quantity, 3),
        unit: text(item.unit, 50),
        price: money(item.price),
        legacy_catalog_reference: item.catalogId ? text(legacyOf(item.catalogId), 80) : null,
        sort_order: index,
      },
    });
  }
}

function idFilter(value, relation) {
  const id = legacyClause(value);
  if (id == null) return null;
  return relation ? { [relation]: { legacy_mongo_id: id } } : { legacy_mongo_id: id };
}

function requestWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'customerId') {
      const part = idFilter(value, 'users_repair_requests_customer_user_idTousers');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'contractorId') {
      const part = idFilter(value, 'users_repair_requests_contractor_user_idTousers');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'storeId') {
      const part = idFilter(value, 'stores');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === '_id') {
      const part = idFilter(value);
      if (!part) return null;
      Object.assign(where, part);
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

function roomWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'requestId') {
      const part = idFilter(value, 'repair_requests');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'customerId') {
      const part = idFilter(value, 'users_chat_rooms_customer_user_idTousers');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'contractorId') {
      const part = idFilter(value, 'users_chat_rooms_contractor_user_idTousers');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === '_id') {
      const part = idFilter(value);
      if (!part) return null;
      Object.assign(where, part);
    } else {
      return null;
    }
  }
  return where;
}

function messageWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'roomId') {
      const part = idFilter(value, 'chat_rooms');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === '_id') {
      const part = idFilter(value);
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'createdAt') {
      const created = compareClause(value);
      if (!created) return null;
      where.created_at = created;
    } else {
      return null;
    }
  }
  return where;
}

function quoteWhere(filter) {
  const where = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'requestId') {
      const part = idFilter(value, 'repair_requests');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'customerId') {
      const part = idFilter(value, 'users_quotations_customer_user_idTousers');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === 'contractorId') {
      const part = idFilter(value, 'users_quotations_contractor_user_idTousers');
      if (!part) return null;
      Object.assign(where, part);
    } else if (key === '_id') {
      const part = idFilter(value);
      if (!part) return null;
      Object.assign(where, part);
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

const messageInclude = {
  locations: true,
  quotations: { select: { legacy_mongo_id: true } },
  chat_rooms: { select: { legacy_mongo_id: true } },
  users: { select: { legacy_mongo_id: true } },
};
const quoteInclude = {
  quotation_items: true,
  repair_requests: { select: { legacy_mongo_id: true } },
  users_quotations_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_quotations_contractor_user_idTousers: { select: { legacy_mongo_id: true } },
  chat_rooms: { select: { legacy_mongo_id: true } },
};

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
      const doc = new Factory({ ...data, _id: data._id });
      await doc.save(tx);
      return doc;
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
    async findOneAndUpdate(filter, update, options = {}) {
      let doc = await this.findOne(filter);
      const data = update?.$set || update;
      if (!doc && options.upsert) {
        doc = await this.create({ ...filter, ...data });
        return doc;
      }
      if (!doc) return null;
      Object.assign(doc, data);
      await doc.save();
      return doc;
    },
    async updateMany(filter, update, tx) {
      const rows = await rowsFor(filter);
      const data = update?.$set || update;
      for (const row of rows) {
        Object.assign(row, data);
        await row.save(tx);
      }
      return { modifiedCount: rows.length };
    },
    async aggregate(pipeline) {
      let rows = (await loader()).map((row) => (row.toPlain ? row.toPlain() : { ...row }));
      for (const stage of pipeline) {
        if (stage.$match) rows = rows.filter((row) => matches(row, stage.$match));
        else if (stage.$group) {
          const groups = new Map();
          for (const row of rows) {
            const id = row[String(stage.$group._id).replace('$', '')];
            const key = String(id);
            if (!groups.has(key)) groups.set(key, { _id: id, total: 0, answered: 0 });
            const group = groups.get(key);
            group.total += 1;
            const answered = stage.$group.answered?.$sum?.$cond;
            const allowed = answered?.[0]?.$in?.[1] || [];
            if (allowed.map(String).includes(String(row.status))) group.answered += 1;
          }
          rows = [...groups.values()];
        }
      }
      return rows;
    },
  };
}

const roomInclude = {
  users_chat_rooms_customer_user_idTousers: { select: { legacy_mongo_id: true } },
  users_chat_rooms_contractor_user_idTousers: { select: { legacy_mongo_id: true } },
  repair_requests: { select: { legacy_mongo_id: true } },
};

module.exports = {
  RepairRequest: model(allRequests, PgRequest, {
    where: requestWhere,
    rows: (where, state) => prisma.repair_requests.findMany({
      where,
      include: requestInclude,
      orderBy: state?.sort?.createdAt < 0 ? { created_at: 'desc' } : state?.sort?.createdAt > 0 ? { created_at: 'asc' } : undefined,
    }).then((rows) => rows.map(requestFromRow)),
    count: (where) => prisma.repair_requests.count({ where }),
  }),
  ChatRoom: model(allRooms, PgRoom, {
    where: roomWhere,
    rows: (where) => prisma.chat_rooms.findMany({ where, include: roomInclude }).then((rows) => rows.map(roomFromRow)),
    count: (where) => prisma.chat_rooms.count({ where }),
  }),
  Message: model(allMessages, PgMessage, {
    where: messageWhere,
    rows: (where, state) => prisma.messages.findMany({
      where,
      include: messageInclude,
      orderBy: state?.sort?.createdAt < 0 ? { created_at: 'desc' } : undefined,
      take: state?.limit > 0 ? state.limit : undefined,
    }).then((rows) => rows.map(messageFromRow)),
    count: (where) => prisma.messages.count({ where }),
  }),
  Quotation: model(allQuotes, PgQuote, {
    where: quoteWhere,
    rows: (where) => prisma.quotations.findMany({ where, include: quoteInclude }).then((rows) => rows.map(quoteFromRow)),
    count: (where) => prisma.quotations.count({ where }),
  }),
};
