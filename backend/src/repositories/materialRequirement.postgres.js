const crypto = require('crypto');
const { prisma } = require('../config/prisma');
const { normalizeMrlUnit } = require('../utils/material-requirement.rules');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function text(value, max) {
  const raw = value == null ? '' : String(value).trim();
  return max ? raw.slice(0, max) : raw;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function qty(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : '0.000';
}

function asId(row) {
  return row?.legacy_mongo_id || String(row?.id || '');
}

function requestCodeOf(id) {
  return `MR-${String(id || '').slice(-6).toUpperCase()}`;
}

function listKind(row) {
  if (row.parent_list_id) {
    return row.status === 'DRAFT' ? 'SAVED' : 'REQUEST';
  }
  return row.store_id ? 'REQUEST' : 'SOURCE';
}

function listPublic(row, items = [], quotes = []) {
  if (!row) return null;
  const id = asId(row);
  return {
    id,
    _id: id,
    requestId: row.request_legacy_id || String(row.repair_request_id || ''),
    contractorId: row.contractor_legacy_id || String(row.contractor_user_id || ''),
    customerId: row.customer_legacy_id || '',
    customerName: row.customer_name || '',
    siteAddress: row.site_address || '',
    siteLat: row.site_lat == null ? null : Number(row.site_lat),
    siteLng: row.site_lng == null ? null : Number(row.site_lng),
    requestTitle: row.request_title || '',
    storeId: row.store_legacy_id || (row.store_id ? String(row.store_id) : ''),
    storeName: row.store_name || '',
    status: row.status,
    note: row.note || '',
    title: row.title || '',
    parentListId: row.parent_legacy_id || '',
    kind: listKind(row),
    requestCode: requestCodeOf(id),
    items: items.map(itemPublic),
    quotes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemPublic(row) {
  return {
    id: String(row.id),
    name: row.name,
    specification: row.specification || '',
    unit: normalizeMrlUnit(row.unit),
    quantity: Number(row.quantity),
    notes: row.notes || '',
    sortOrder: Number(row.sort_order || 0),
  };
}

function quotePublic(row, quoteItems = []) {
  return {
    id: asId(row),
    _id: asId(row),
    storeId: row.store_legacy_id || String(row.store_id || ''),
    storeUserId: row.store_user_legacy_id || String(row.store_user_id || ''),
    status: row.status,
    deliveryFee: Number(row.delivery_fee || 0),
    note: row.note || '',
    items: quoteItems.map((item) => ({
      id: String(item.id),
      itemId: String(item.requirement_item_id),
      name: item.name || '',
      quantity: Number(item.quantity || 0),
      unit: normalizeMrlUnit(item.unit),
      unitPrice: Number(item.unit_price || 0),
      availableQty: Number(item.available_qty || 0),
      note: item.note || '',
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBigInt(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'bigint') return value;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

const listSelect = `
  mrl.*,
  rr.legacy_mongo_id AS request_legacy_id,
  rr.title AS request_title,
  cu.legacy_mongo_id AS contractor_legacy_id,
  cust.legacy_mongo_id AS customer_legacy_id,
  cust.full_name AS customer_name,
  loc.formatted_address AS site_address,
  loc.latitude AS site_lat,
  loc.longitude AS site_lng,
  st.legacy_mongo_id AS store_legacy_id,
  st.name AS store_name
`;

async function loadList(whereSql, params) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${listSelect}
     FROM material_requirement_lists mrl
     JOIN repair_requests rr ON rr.id = mrl.repair_request_id
     JOIN users cu ON cu.id = mrl.contractor_user_id
     JOIN users cust ON cust.id = rr.customer_user_id
     LEFT JOIN locations loc ON loc.id = rr.location_id
     LEFT JOIN stores st ON st.id = mrl.store_id
     WHERE ${whereSql}
     LIMIT 1`,
    ...params
  );
  return rows[0] || null;
}

async function loadItems(listPk) {
  const pk = toBigInt(listPk);
  return prisma.$queryRaw`
    SELECT * FROM material_requirement_items
    WHERE list_id = ${pk}
    ORDER BY sort_order ASC, id ASC
  `;
}

async function loadQuotes(listPk) {
  const pk = toBigInt(listPk);
  const quotes = await prisma.$queryRaw`
    SELECT mq.*, st.legacy_mongo_id AS store_legacy_id, su.legacy_mongo_id AS store_user_legacy_id
    FROM material_quotes mq
    JOIN stores st ON st.id = mq.store_id
    JOIN users su ON su.id = mq.store_user_id
    WHERE mq.list_id = ${pk}
    ORDER BY mq.created_at DESC
  `;
  const result = [];
  for (const quote of quotes) {
    const quotePk = toBigInt(quote.id);
    const items = await prisma.$queryRaw`
      SELECT mqi.*, mri.name, mri.quantity, mri.unit
      FROM material_quote_items mqi
      JOIN material_requirement_items mri ON mri.id = mqi.requirement_item_id
      WHERE mqi.quote_id = ${quotePk}
    `;
    result.push(quotePublic(quote, items));
  }
  return result;
}

async function hydrate(row) {
  if (!row) return null;
  if (row.parent_list_id && !row.parent_legacy_id) {
    const pk = toBigInt(row.parent_list_id);
    const parent = await prisma.$queryRaw`
      SELECT legacy_mongo_id FROM material_requirement_lists WHERE id = ${pk} LIMIT 1
    `;
    row.parent_legacy_id = parent[0]?.legacy_mongo_id || '';
  }
  const items = await loadItems(row.id);
  const quotes = await loadQuotes(row.id);
  return listPublic(row, items, quotes);
}

async function findByPublicId(id) {
  const key = text(id, 40);
  if (!key) return null;
  if (/^\d+$/.test(key)) {
    const row = await loadList('mrl.id = $1::bigint OR mrl.legacy_mongo_id = $2', [key, key]);
    return hydrate(row);
  }
  const row = await loadList('mrl.legacy_mongo_id = $1', [key]);
  return hydrate(row);
}

async function findActiveByRequest(requestPk) {
  const pk = toBigInt(requestPk);
  const row = await loadList(
    "mrl.repair_request_id = $1::bigint AND mrl.parent_list_id IS NULL AND mrl.status <> 'CANCELLED'",
    [pk]
  );
  return hydrate(row);
}

async function findSavedDraft(parentPk) {
  const pk = toBigInt(parentPk);
  const row = await loadList("mrl.parent_list_id = $1::bigint AND mrl.status = 'DRAFT'", [pk]);
  return hydrate(row);
}

async function findRequestForStore({ parentPk, sourcePk, storePk }) {
  const store = toBigInt(storePk);
  if (!store) return null;
  const ids = [toBigInt(parentPk), toBigInt(sourcePk)].filter(Boolean);
  for (const pk of ids) {
    const row = await loadList(
      `mrl.store_id = $1::bigint AND mrl.status <> 'CANCELLED'
       AND (mrl.id = $2::bigint OR mrl.parent_list_id = $2::bigint)`,
      [store, pk]
    );
    if (row) return hydrate(row);
  }
  return null;
}

async function listByContractor(contractorPk) {
  const pk = toBigInt(contractorPk);
  const rows = await prisma.$queryRaw`
    SELECT mrl.*, rr.legacy_mongo_id AS request_legacy_id, rr.title AS request_title,
           cu.legacy_mongo_id AS contractor_legacy_id,
           cust.legacy_mongo_id AS customer_legacy_id, cust.full_name AS customer_name,
           loc.formatted_address AS site_address, loc.latitude AS site_lat, loc.longitude AS site_lng,
           st.legacy_mongo_id AS store_legacy_id, st.name AS store_name
    FROM material_requirement_lists mrl
    JOIN repair_requests rr ON rr.id = mrl.repair_request_id
    JOIN users cu ON cu.id = mrl.contractor_user_id
    JOIN users cust ON cust.id = rr.customer_user_id
    LEFT JOIN locations loc ON loc.id = rr.location_id
    LEFT JOIN stores st ON st.id = mrl.store_id
    WHERE mrl.contractor_user_id = ${pk} AND mrl.parent_list_id IS NULL
    ORDER BY mrl.created_at DESC
  `;
  const out = [];
  for (const row of rows) out.push(await hydrate(row));
  return out;
}

async function listByCustomer(customerPk) {
  const pk = toBigInt(customerPk);
  const rows = await prisma.$queryRaw`
    SELECT mrl.*, rr.legacy_mongo_id AS request_legacy_id, rr.title AS request_title,
           cu.legacy_mongo_id AS contractor_legacy_id,
           cust.legacy_mongo_id AS customer_legacy_id, cust.full_name AS customer_name,
           loc.formatted_address AS site_address, loc.latitude AS site_lat, loc.longitude AS site_lng,
           st.legacy_mongo_id AS store_legacy_id, st.name AS store_name
    FROM material_requirement_lists mrl
    JOIN repair_requests rr ON rr.id = mrl.repair_request_id
    JOIN users cu ON cu.id = mrl.contractor_user_id
    JOIN users cust ON cust.id = rr.customer_user_id
    LEFT JOIN locations loc ON loc.id = rr.location_id
    LEFT JOIN stores st ON st.id = mrl.store_id
    WHERE rr.customer_user_id = ${pk} AND mrl.status <> 'CANCELLED'
    ORDER BY mrl.created_at DESC
  `;
  const out = [];
  for (const row of rows) out.push(await hydrate(row));
  return out;
}

async function listByStore(storePk) {
  const pk = toBigInt(storePk);
  const rows = await prisma.$queryRaw`
    SELECT mrl.*, rr.legacy_mongo_id AS request_legacy_id, rr.title AS request_title,
           cu.legacy_mongo_id AS contractor_legacy_id,
           cust.legacy_mongo_id AS customer_legacy_id, cust.full_name AS customer_name,
           loc.formatted_address AS site_address, loc.latitude AS site_lat, loc.longitude AS site_lng,
           st.legacy_mongo_id AS store_legacy_id, st.name AS store_name
    FROM material_requirement_lists mrl
    JOIN repair_requests rr ON rr.id = mrl.repair_request_id
    JOIN users cu ON cu.id = mrl.contractor_user_id
    JOIN users cust ON cust.id = rr.customer_user_id
    LEFT JOIN locations loc ON loc.id = rr.location_id
    LEFT JOIN stores st ON st.id = mrl.store_id
    WHERE mrl.store_id = ${pk} AND mrl.status IN ('SENT','QUOTED','CONFIRMED','PREPARING','DELIVERING','DELIVERED','CANCELLED')
    ORDER BY mrl.updated_at DESC
  `;
  const out = [];
  for (const row of rows) out.push(await hydrate(row));
  return out;
}

async function insertList({ requestPk, contractorPk, note, title, parentPk, status, storePk }) {
  const legacy = newId();
  const reqPk = toBigInt(requestPk);
  const conPk = toBigInt(contractorPk);
  const parent = parentPk ? toBigInt(parentPk) : null;
  const store = storePk ? toBigInt(storePk) : null;
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO material_requirement_lists (
      legacy_mongo_id, repair_request_id, contractor_user_id, store_id, note, status, parent_list_id, title
    ) VALUES (
      $1, $2::bigint, $3::bigint, $4::bigint, $5, $6, $7::bigint, $8
    )
    RETURNING *`,
    legacy,
    reqPk,
    conPk,
    store,
    text(note, 1000),
    status || 'DRAFT',
    parent,
    text(title, 140)
  );
  return rows[0];
}

async function cloneList({ sourcePk, parentPk, status, storePk, title, note }) {
  const source = await prisma.$queryRaw`
    SELECT * FROM material_requirement_lists WHERE id = ${toBigInt(sourcePk)} LIMIT 1
  `;
  const row = source[0];
  if (!row) return null;
  const created = await insertList({
    requestPk: row.repair_request_id,
    contractorPk: row.contractor_user_id,
    note: note == null ? row.note : note,
    title: title == null ? row.title : title,
    parentPk: parentPk || row.id,
    status: status || 'DRAFT',
    storePk,
  });
  const items = await loadItems(row.id);
  for (let i = 0; i < items.length; i += 1) {
    await insertItem(created.id, {
      name: items[i].name,
      specification: items[i].specification,
      unit: items[i].unit,
      quantity: items[i].quantity,
      notes: items[i].notes,
    }, i);
  }
  return created;
}

async function insertItem(listPk, item, sortOrder) {
  const pk = toBigInt(listPk);
  const rows = await prisma.$queryRaw`
    INSERT INTO material_requirement_items (
      list_id, name, specification, unit, quantity, notes, sort_order
    ) VALUES (
      ${pk}, ${item.name}, ${item.specification || ''}, ${item.unit || ''},
      ${qty(item.quantity)}::numeric, ${item.notes || ''}, ${sortOrder}
    )
    RETURNING *
  `;
  return rows[0];
}

async function updateItem(itemPk, item) {
  const pk = toBigInt(itemPk);
  const rows = await prisma.$queryRaw`
    UPDATE material_requirement_items
    SET name = ${item.name},
        specification = ${item.specification || ''},
        unit = ${item.unit || ''},
        quantity = ${qty(item.quantity)}::numeric,
        notes = ${item.notes || ''},
        updated_at = now()
    WHERE id = ${pk}
    RETURNING *
  `;
  return rows[0];
}

async function deleteItem(itemPk, listPk) {
  const iPk = toBigInt(itemPk);
  const lPk = toBigInt(listPk);
  await prisma.$executeRaw`
    DELETE FROM material_requirement_items WHERE id = ${iPk} AND list_id = ${lPk}
  `;
}

async function listPkByPublicId(id) {
  const key = text(id, 40);
  if (!key) return null;
  const rows = await prisma.$queryRaw`
    SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${key} LIMIT 1
  `;
  return rows[0]?.id || null;
}

async function replaceItems(listPk, items) {
  const pk = toBigInt(listPk);
  await prisma.$executeRaw`DELETE FROM material_requirement_items WHERE list_id = ${pk}`;
  for (let i = 0; i < (items || []).length; i += 1) {
    await insertItem(pk, items[i], i);
  }
}

async function updateList(listPk, fields) {
  const pk = toBigInt(listPk);
  const status = fields.status;
  const note = fields.note;
  const title = fields.title;
  const storePk = fields.storePk === undefined ? undefined : fields.storePk;
  const rows = await prisma.$queryRawUnsafe(
    `UPDATE material_requirement_lists
     SET status = COALESCE($2, status),
         note = COALESCE($3, note),
         store_id = CASE WHEN $4::int = 1 THEN $5::bigint ELSE store_id END,
         title = COALESCE($6, title),
         updated_at = now()
     WHERE id = $1::bigint
     RETURNING *`,
    pk,
    status || null,
    note == null ? null : text(note, 1000),
    storePk === undefined ? 0 : 1,
    storePk ? toBigInt(storePk) : null,
    title == null ? null : text(title, 140)
  );
  return rows[0];
}

async function insertQuote({ listPk, storePk, storeUserPk, deliveryFee, note, lines }) {
  const legacy = newId();
  const lPk = toBigInt(listPk);
  const sPk = toBigInt(storePk);
  const suPk = toBigInt(storeUserPk);
  const quotes = await prisma.$queryRaw`
    INSERT INTO material_quotes (
      legacy_mongo_id, list_id, store_id, store_user_id, status, delivery_fee, note
    ) VALUES (
      ${legacy}, ${lPk}, ${sPk}, ${suPk}, 'SENT',
      ${money(deliveryFee)}::numeric, ${text(note, 1000)}
    )
    RETURNING *
  `;
  const quote = quotes[0];
  const qPk = toBigInt(quote.id);
  for (const line of lines) {
    const itmPk = toBigInt(line.itemPk);
    await prisma.$queryRaw`
      INSERT INTO material_quote_items (
        quote_id, requirement_item_id, unit_price, available_qty, note
      ) VALUES (
        ${qPk}, ${itmPk}, ${money(line.unitPrice)}::numeric,
        ${qty(line.availableQty)}::numeric, ${text(line.note, 500)}
      )
    `;
  }
  return quote;
}

async function updateQuoteStatus(quotePk, status) {
  const pk = toBigInt(quotePk);
  const rows = await prisma.$queryRaw`
    UPDATE material_quotes SET status = ${status}, updated_at = now()
    WHERE id = ${pk}
    RETURNING *
  `;
  return rows[0];
}

async function updateQuote(quotePk, { deliveryFee, note, lines }) {
  const qPk = toBigInt(quotePk);
  const quotes = await prisma.$queryRaw`
    UPDATE material_quotes
    SET delivery_fee = ${money(deliveryFee)}::numeric,
        note = ${text(note, 1000)},
        updated_at = now()
    WHERE id = ${qPk}
    RETURNING *
  `;
  await prisma.$executeRaw`
    DELETE FROM material_quote_items WHERE quote_id = ${qPk}
  `;
  for (const line of lines) {
    const itmPk = toBigInt(line.itemPk);
    await prisma.$queryRaw`
      INSERT INTO material_quote_items (
        quote_id, requirement_item_id, unit_price, available_qty, note
      ) VALUES (
        ${qPk}, ${itmPk}, ${money(line.unitPrice)}::numeric,
        ${qty(line.availableQty)}::numeric, ${text(line.note, 500)}
      )
    `;
  }
  return quotes[0];
}

async function findQuotePk(publicId) {
  const key = text(publicId, 40);
  if (!key) return null;
  if (/^\d+$/.test(key)) {
    const rows = await prisma.$queryRaw`
      SELECT id FROM material_quotes WHERE id = ${BigInt(key)} OR legacy_mongo_id = ${key} LIMIT 1
    `;
    return rows[0] || null;
  }
  const rows = await prisma.$queryRaw`
    SELECT id FROM material_quotes WHERE legacy_mongo_id = ${key} LIMIT 1
  `;
  return rows[0] || null;
}

async function userPk(legacyId) {
  const id = text(legacyId, 40);
  if (!id) return null;
  if (/^\d+$/.test(id)) {
    const row = await prisma.users.findFirst({ where: { OR: [{ id: BigInt(id) }, { legacy_mongo_id: id }] }, select: { id: true } });
    return row?.id || null;
  }
  const row = await prisma.users.findFirst({ where: { legacy_mongo_id: id }, select: { id: true } });
  return row?.id || null;
}

async function requestRow(legacyId) {
  const id = text(legacyId, 40);
  if (!id) return null;
  if (/^\d+$/.test(id)) {
    const pk = BigInt(id);
    const rows = await prisma.$queryRaw`
      SELECT rr.*, cu.legacy_mongo_id AS contractor_legacy_id, ru.legacy_mongo_id AS request_legacy_id
      FROM repair_requests rr
      LEFT JOIN users cu ON cu.id = rr.contractor_user_id
      JOIN users ru ON ru.id = rr.customer_user_id
      WHERE rr.id = ${pk} OR rr.legacy_mongo_id = ${id}
      LIMIT 1
    `;
    return rows[0] || null;
  }
  const rows = await prisma.$queryRaw`
    SELECT rr.*, cu.legacy_mongo_id AS contractor_legacy_id, ru.legacy_mongo_id AS request_legacy_id
    FROM repair_requests rr
    LEFT JOIN users cu ON cu.id = rr.contractor_user_id
    JOIN users ru ON ru.id = rr.customer_user_id
    WHERE rr.legacy_mongo_id = ${id}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function storeRow(legacyId) {
  const id = text(legacyId, 40);
  if (!id) return null;
  if (/^\d+$/.test(id)) {
    const pk = BigInt(id);
    const rows = await prisma.$queryRaw`
      SELECT st.*, ow.legacy_mongo_id AS owner_legacy_id
      FROM stores st
      JOIN users ow ON ow.id = st.owner_user_id
      WHERE st.id = ${pk} OR st.legacy_mongo_id = ${id}
      LIMIT 1
    `;
    return rows[0] || null;
  }
  const rows = await prisma.$queryRaw`
    SELECT st.*, ow.legacy_mongo_id AS owner_legacy_id
    FROM stores st
    JOIN users ow ON ow.id = st.owner_user_id
    WHERE st.legacy_mongo_id = ${id}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function tablesReady() {
  const rows = await prisma.$queryRaw`
    SELECT 1 AS ok FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'material_requirement_lists'
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

const FULFILLMENT_CHECK = `CHECK (status IN ('DRAFT','SENT','QUOTED','CONFIRMED','PREPARING','DELIVERING','DELIVERED','CANCELLED'))`;

async function ensureFulfillmentConstraint() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'material_requirement_lists' AND c.conname = 'chk_mrl_status'
    LIMIT 1
  `);
  const def = String(rows[0]?.def || '');
  if (def.includes('PREPARING') && def.includes('DELIVERING') && def.includes('DELIVERED')) {
    return false;
  }
  await prisma.$executeRawUnsafe('ALTER TABLE material_requirement_lists DROP CONSTRAINT IF EXISTS chk_mrl_status');
  await prisma.$executeRawUnsafe(`ALTER TABLE material_requirement_lists ADD CONSTRAINT chk_mrl_status ${FULFILLMENT_CHECK}`);
  return true;
}

async function ensureCustomerSaveSchema() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE material_requirement_lists
      ADD COLUMN IF NOT EXISTS parent_list_id BIGINT REFERENCES material_requirement_lists(id) ON DELETE SET NULL
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE material_requirement_lists
      ADD COLUMN IF NOT EXISTS title VARCHAR(140) NOT NULL DEFAULT ''
  `);
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS uq_mrl_active_request');
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_source_request
      ON material_requirement_lists (repair_request_id)
      WHERE parent_list_id IS NULL AND status <> 'CANCELLED'
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_saved_draft
      ON material_requirement_lists (parent_list_id)
      WHERE parent_list_id IS NOT NULL AND status = 'DRAFT'
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mrl_parent_store
      ON material_requirement_lists (parent_list_id, store_id)
      WHERE parent_list_id IS NOT NULL AND store_id IS NOT NULL AND status <> 'CANCELLED'
  `);
  return true;
}

module.exports = {
  newId,
  findByPublicId,
  findActiveByRequest,
  findSavedDraft,
  findRequestForStore,
  listByContractor,
  listByCustomer,
  listByStore,
  insertList,
  cloneList,
  insertItem,
  updateItem,
  deleteItem,
  replaceItems,
  listPkByPublicId,
  updateList,
  insertQuote,
  updateQuoteStatus,
  updateQuote,
  findQuotePk,
  userPk,
  requestRow,
  storeRow,
  tablesReady,
  ensureFulfillmentConstraint,
  ensureCustomerSaveSchema,
  loadItems,
  hydrate,
};
