/**
 * Copy repair requests, chat rooms, messages, and quotations from MongoDB
 * into the existing PostgreSQL tables. Does not delete PostgreSQL rows or write MongoDB.
 */
const fs = require('fs');
const path = require('path');
const { connectMongo, connectPostgres, closeConnections } = require('./lib/connections');
const { prisma } = require('../../src/config/prisma');

const REQUEST_STATUS = new Set(['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED']);
const MESSAGE_TYPE = new Set(['TEXT', 'IMAGE', 'VIDEO', 'QUOTATION', 'LOCATION']);
const QUOTE_STATUS = new Set(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'MODIFICATION_REQUEST']);
const ITEM_TYPE = new Set(['MATERIAL', 'LABOR']);
const LOCATION_SOURCE = new Set(['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN']);

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function idOf(value) {
  return value ? String(value) : '';
}

function money(value, scale = 2) {
  if (value == null || value === '') return '0.00';
  const raw = String(value);
  if (/^\d+(\.\d+)?$/.test(raw)) return raw;
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(scale) : null;
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
  const tables = ['repair_requests', 'repair_request_media', 'chat_rooms', 'messages', 'quotations', 'quotation_items', 'locations'];
  const out = {};
  for (const table of tables) {
    out[table] = Number((await pg.query(`SELECT COUNT(*)::int AS count FROM public.${table}`)).rows[0].count);
  }
  return out;
}

function writeReport(report) {
  const outputDir = path.resolve(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'repair-chat-quotation-backfill-report.json'), JSON.stringify(report, null, 2));
}

async function main() {
  let pg;
  const report = {
    generated_at: new Date().toISOString(),
    committed: false,
    mongo: {},
    postgres_before: {},
    inserted: { repair_requests: 0, chat_rooms: 0, messages: 0, quotations: 0, quotation_items: 0 },
    already_mapped: { repair_requests: 0, chat_rooms: 0, messages: 0, quotations: 0 },
    skipped: [],
    orphans: [],
    collisions: [],
    total_mismatches: [],
    postgres_after: {},
    mongo_after: {},
    mongo_writes: false,
  };

  try {
    const mongo = await connectMongo();
    pg = await connectPostgres();
    const requests = await collection(mongo, 'repairrequests');
    const rooms = await collection(mongo, 'chatrooms');
    const messages = await collection(mongo, 'messages');
    const quotations = await collection(mongo, 'quotations');
    const mongoBefore = {
      repairrequests: requests.length,
      chatrooms: rooms.length,
      messages: messages.length,
      quotations: quotations.length,
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
    const catalogs = await prisma.catalog_services.findMany({ select: { id: true, legacy_mongo_id: true, code: true } });
    const categories = new Map((await prisma.service_categories.findMany()).map((row) => [row.name, row.id]));

    await prisma.$transaction(async (tx) => {
      const requestByLegacy = new Map();
      const existingRequests = await tx.repair_requests.findMany({ select: { id: true, legacy_mongo_id: true } });
      for (const row of existingRequests) if (row.legacy_mongo_id) requestByLegacy.set(row.legacy_mongo_id, row.id);

      for (const doc of requests) {
        const mongoId = idOf(doc._id);
        if (requestByLegacy.has(mongoId)) {
          report.already_mapped.repair_requests += 1;
          continue;
        }
        const customer = users.get(idOf(doc.customerId));
        const contractor = users.get(idOf(doc.contractorId));
        const status = doc.status || 'PENDING';
        if (!customer || !contractor || !REQUEST_STATUS.has(status) || !text(doc.title, 140) || !text(doc.description, 2000)) {
          skip(report, 'repairrequests', mongoId, !customer || !contractor ? 'repair customer or contractor is not in PostgreSQL' : 'invalid repair request fields', {
            customer_id: idOf(doc.customerId),
            contractor_id: idOf(doc.contractorId),
            status,
          });
          continue;
        }
        const store = doc.storeId ? stores.get(idOf(doc.storeId)) : null;
        if (doc.storeId && !store) note(report, 'repairrequests', mongoId, 'repair store is not in PostgreSQL', { store_id: idOf(doc.storeId) });
        const catalogKey = text(doc.catalogServiceId, 160);
        const catalog = catalogKey ? catalogs.find((row) => row.legacy_mongo_id === catalogKey || row.code === catalogKey) : null;
        if (catalogKey && !catalog) note(report, 'repairrequests', mongoId, 'repair catalog reference is not in PostgreSQL', { catalog_id: catalogKey });
        const coords = doc.location?.coordinates || [];
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        const source = LOCATION_SOURCE.has(doc.locationSource) ? doc.locationSource : null;
        if (doc.locationSource && !source) note(report, 'repairrequests', mongoId, 'repair location source is not a PostgreSQL value', { location_source: doc.locationSource });
        const location = await tx.locations.create({
          data: {
            formatted_address: text(doc.address) || null,
            latitude: Number.isFinite(lat) ? lat : null,
            longitude: Number.isFinite(lng) ? lng : null,
            location_source: source,
            is_confirmed: Boolean(doc.locationConfirmed),
            confirmed_at: doc.locationConfirmedAt || null,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        const images = Array.isArray(doc.images) ? doc.images.filter(Boolean) : [];
        const videos = Array.isArray(doc.videos) ? doc.videos.filter(Boolean) : [];
        const row = await tx.repair_requests.create({
          data: {
            legacy_mongo_id: mongoId,
            customer_user_id: customer,
            contractor_user_id: contractor,
            store_id: store || null,
            service_category_id: categories.get(text(doc.category, 80)) || null,
            catalog_service_id: catalog?.id || null,
            category_snapshot: text(doc.category, 80),
            service_name_snapshot: text(doc.serviceName, 80),
            title: text(doc.title, 140),
            description: text(doc.description, 2000),
            location_id: location.id,
            status,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
            repair_request_media: {
              create: [
                ...images.map((file, index) => ({ media_type: 'IMAGE', file_url: String(file), sort_order: index })),
                ...videos.map((file, index) => ({ media_type: 'VIDEO', file_url: String(file), sort_order: images.length + index })),
              ],
            },
          },
        });
        requestByLegacy.set(mongoId, row.id);
        report.inserted.repair_requests += 1;
      }

      const roomByLegacy = new Map();
      const existingRooms = await tx.chat_rooms.findMany({ select: { id: true, legacy_mongo_id: true, repair_request_id: true } });
      const roomByRequest = new Map(existingRooms.map((row) => [String(row.repair_request_id), row]));
      for (const row of existingRooms) if (row.legacy_mongo_id) roomByLegacy.set(row.legacy_mongo_id, row.id);

      for (const doc of rooms) {
        const mongoId = idOf(doc._id);
        if (roomByLegacy.has(mongoId)) {
          report.already_mapped.chat_rooms += 1;
          continue;
        }
        const customer = users.get(idOf(doc.customerId));
        const contractor = users.get(idOf(doc.contractorId));
        const requestId = requestByLegacy.get(idOf(doc.requestId));
        if (!customer || !contractor || !requestId) {
          skip(report, 'chatrooms', mongoId, 'chat room customer, contractor, or request is not in PostgreSQL', {
            customer_id: idOf(doc.customerId),
            contractor_id: idOf(doc.contractorId),
            request_id: idOf(doc.requestId),
          });
          continue;
        }
        if (roomByRequest.has(String(requestId))) {
          report.collisions.push({ collection: 'chatrooms', mongo_id: mongoId, reason: 'PostgreSQL already has a room for this repair request' });
          continue;
        }
        const row = await tx.chat_rooms.create({
          data: {
            legacy_mongo_id: mongoId,
            customer_user_id: customer,
            contractor_user_id: contractor,
            repair_request_id: requestId,
            last_message: text(doc.lastMessage),
            last_message_at: doc.lastMessageAt || doc.createdAt || new Date(),
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        roomByLegacy.set(mongoId, row.id);
        roomByRequest.set(String(requestId), row);
        report.inserted.chat_rooms += 1;
      }

      const quoteByLegacy = new Map();
      const existingQuotes = await tx.quotations.findMany({ select: { id: true, legacy_mongo_id: true } });
      for (const row of existingQuotes) if (row.legacy_mongo_id) quoteByLegacy.set(row.legacy_mongo_id, row.id);

      for (const doc of quotations) {
        const mongoId = idOf(doc._id);
        if (quoteByLegacy.has(mongoId)) {
          report.already_mapped.quotations += 1;
          continue;
        }
        const requestId = requestByLegacy.get(idOf(doc.requestId));
        const customer = users.get(idOf(doc.customerId));
        const contractor = users.get(idOf(doc.contractorId));
        const status = doc.status || 'SENT';
        const days = doc.estimatedDays == null || doc.estimatedDays === '' ? 1 : Number(doc.estimatedDays);
        const material = money(doc.materialCost);
        const labor = money(doc.laborCost);
        const transport = money(doc.transportCost);
        const total = money(doc.totalCost);
        if (!requestId || !customer || !contractor || !QUOTE_STATUS.has(status) || !Number.isInteger(days) || days < 1 || days > 180 || material == null || labor == null || transport == null || total == null) {
          skip(report, 'quotations', mongoId, !requestId || !customer || !contractor ? 'quotation request or party is not in PostgreSQL' : 'invalid quotation fields', {
            request_id: idOf(doc.requestId),
            customer_id: idOf(doc.customerId),
            contractor_id: idOf(doc.contractorId),
            status,
          });
          continue;
        }
        const roomId = doc.roomId ? roomByLegacy.get(idOf(doc.roomId)) : null;
        if (doc.roomId && !roomId) note(report, 'quotations', mongoId, 'quotation room is not in PostgreSQL', { room_id: idOf(doc.roomId) });
        const items = Array.isArray(doc.items) ? doc.items : [];
        const invalidItem = items.find((item) => !ITEM_TYPE.has(item.type) || money(item.price) == null || !text(item.name, 140));
        if (invalidItem) {
          skip(report, 'quotations', mongoId, 'quotation item fields are invalid');
          continue;
        }
        const row = await tx.quotations.create({
          data: {
            legacy_mongo_id: mongoId,
            repair_request_id: requestId,
            customer_user_id: customer,
            contractor_user_id: contractor,
            chat_room_id: roomId || null,
            material_cost: material,
            labor_cost: labor,
            transport_cost: transport,
            total_cost: total,
            estimated_days: days,
            note: text(doc.note, 1000),
            modification_note: text(doc.modificationNote, 1000),
            status,
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
            quotation_items: {
              create: items.map((item, index) => ({
                item_type: item.type,
                name_snapshot: text(item.name, 140),
                quantity: money(item.quantity == null ? 1 : item.quantity, 3),
                unit: text(item.unit, 50),
                price: money(item.price),
                legacy_catalog_reference: item.catalogId ? text(idOf(item.catalogId), 80) : null,
                sort_order: index,
              })),
            },
          },
        });
        quoteByLegacy.set(mongoId, row.id);
        report.inserted.quotations += 1;
        report.inserted.quotation_items += items.length;
      }

      const existingMessages = new Set((await tx.messages.findMany({ select: { legacy_mongo_id: true } })).map((row) => row.legacy_mongo_id).filter(Boolean));
      for (const doc of messages) {
        const mongoId = idOf(doc._id);
        if (existingMessages.has(mongoId)) {
          report.already_mapped.messages += 1;
          continue;
        }
        const roomId = roomByLegacy.get(idOf(doc.roomId));
        const sender = users.get(idOf(doc.senderId));
        const type = doc.type || 'TEXT';
        if (!roomId || !sender || !MESSAGE_TYPE.has(type)) {
          skip(report, 'messages', mongoId, !roomId || !sender ? 'message room or sender is not in PostgreSQL' : 'invalid message type', {
            room_id: idOf(doc.roomId),
            user_id: idOf(doc.senderId),
            type,
          });
          continue;
        }
        const quoteId = doc.quotationId ? quoteByLegacy.get(idOf(doc.quotationId)) : null;
        if (doc.quotationId && !quoteId) note(report, 'messages', mongoId, 'message quotation is not in PostgreSQL', { quotation_id: idOf(doc.quotationId) });
        let locationId = null;
        if (doc.location && Number.isFinite(Number(doc.location.lat)) && Number.isFinite(Number(doc.location.lng))) {
          const location = await tx.locations.create({
            data: {
              formatted_address: text(doc.location.address, 2000) || null,
              city: text(doc.location.label, 120) || null,
              latitude: Number(doc.location.lat),
              longitude: Number(doc.location.lng),
              is_confirmed: true,
              confirmed_at: doc.createdAt || new Date(),
              created_at: doc.createdAt || new Date(),
              updated_at: doc.updatedAt || new Date(),
            },
          });
          locationId = location.id;
        }
        await tx.messages.create({
          data: {
            legacy_mongo_id: mongoId,
            chat_room_id: roomId,
            sender_user_id: sender,
            message_type: type,
            content: text(doc.content, 4000),
            location_id: locationId,
            quotation_id: quoteId || null,
            is_read: Boolean(doc.read),
            created_at: doc.createdAt || new Date(),
            updated_at: doc.updatedAt || new Date(),
          },
        });
        existingMessages.add(mongoId);
        report.inserted.messages += 1;
      }
    }, { timeout: 180000, maxWait: 20000 });

    report.committed = true;
    report.postgres_after = await counts(pg);
    const mongoAfter = {
      repairrequests: (await collection(mongo, 'repairrequests')).length,
      chatrooms: (await collection(mongo, 'chatrooms')).length,
      messages: (await collection(mongo, 'messages')).length,
      quotations: (await collection(mongo, 'quotations')).length,
    };
    report.mongo_after = mongoAfter;
    report.mongo_writes = JSON.stringify(mongoBefore) !== JSON.stringify(mongoAfter);

    const duplicates = await pg.query(`
      SELECT 'repair_requests' AS table_name FROM public.repair_requests WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'chat_rooms' FROM public.chat_rooms WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'messages' FROM public.messages WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
      UNION ALL SELECT 'quotations' FROM public.quotations WHERE legacy_mongo_id IS NOT NULL GROUP BY legacy_mongo_id HAVING COUNT(*) > 1
    `);
    report.duplicate_legacy_ids = duplicates.rows.length;

    const mapped = await prisma.quotations.findMany({
      where: { legacy_mongo_id: { in: quotations.map((doc) => idOf(doc._id)) } },
      select: { legacy_mongo_id: true, total_cost: true, quotation_items: { select: { price: true, quantity: true } } },
    });
    const byId = new Map(mapped.map((row) => [row.legacy_mongo_id, row]));
    for (const doc of quotations) {
      const row = byId.get(idOf(doc._id));
      if (!row) continue;
      if (Math.abs(Number(row.total_cost) - Number(doc.totalCost || 0)) > 0.001) {
        report.total_mismatches.push({ mongo_id: idOf(doc._id), mongo_total: doc.totalCost, postgres_total: Number(row.total_cost) });
      }
    }
    report.verification_pass = report.duplicate_legacy_ids === 0 && report.total_mismatches.length === 0 && report.mongo_writes === false;
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
