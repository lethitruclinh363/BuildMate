const crypto = require('crypto');
const { prisma } = require('../config/prisma');

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

function listPublic(row, items = [], quotes = []) {
  if (!row) return null;
  return {
    id: asId(row),
    _id: asId(row),
    requestId: row.request_legacy_id || String(row.repair_request_id || ''),
    contractorId: row.contractor_legacy_id || String(row.contractor_user_id || ''),
    storeId: row.store_legacy_id || (row.store_id ? String(row.store_id) : ''),
    storeName: row.store_name || '',
    status: row.status,
    note: row.note || '',
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
    unit: row.unit || '',
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
      unit: item.unit || '',
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
  cu.legacy_mongo_id AS contractor_legacy_id,
  st.legacy_mongo_id AS store_legacy_id,
  st.name AS store_name
`;

async function loadList(whereSql, params) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${listSelect}
     FROM material_requirement_lists mrl
     JOIN repair_requests rr ON rr.id = mrl.repair_request_id
     JOIN users cu ON cu.id = mrl.contractor_user_id
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
  const row = await loadList("mrl.repair_request_id = $1::bigint AND mrl.status <> 'CANCELLED'", [pk]);
  return hydrate(row);
}

async function listByContractor(contractorPk) {
  const pk = toBigInt(contractorPk);
  const rows = await prisma.$queryRaw`
    SELECT mrl.*, rr.legacy_mongo_id AS request_legacy_id,
           cu.legacy_mongo_id AS contractor_legacy_id,
           st.legacy_mongo_id AS store_legacy_id, st.name AS store_name
    FROM material_requirement_lists mrl
    JOIN repair_requests rr ON rr.id = mrl.repair_request_id
    JOIN users cu ON cu.id = mrl.contractor_user_id
    LEFT JOIN stores st ON st.id = mrl.store_id
    WHERE mrl.contractor_user_id = ${pk}
    ORDER BY mrl.created_at DESC
  `;
  const out = [];
  for (const row of rows) out.push(await hydrate(row));
  return out;
}

async function listByStore(storePk) {
  const pk = toBigInt(storePk);
  const rows = await prisma.$queryRaw`
    SELECT mrl.*, rr.legacy_mongo_id AS request_legacy_id,
           cu.legacy_mongo_id AS contractor_legacy_id,
           st.legacy_mongo_id AS store_legacy_id, st.name AS store_name
    FROM material_requirement_lists mrl
    JOIN repair_requests rr ON rr.id = mrl.repair_request_id
    JOIN users cu ON cu.id = mrl.contractor_user_id
    LEFT JOIN stores st ON st.id = mrl.store_id
    WHERE mrl.store_id = ${pk} AND mrl.status IN ('SENT','QUOTED','CONFIRMED')
    ORDER BY mrl.updated_at DESC
  `;
  const out = [];
  for (const row of rows) out.push(await hydrate(row));
  return out;
}

async function insertList({ requestPk, contractorPk, note }) {
  const legacy = newId();
  const reqPk = toBigInt(requestPk);
  const conPk = toBigInt(contractorPk);
  const rows = await prisma.$queryRaw`
    INSERT INTO material_requirement_lists (
      legacy_mongo_id, repair_request_id, contractor_user_id, note, status
    ) VALUES (
      ${legacy}, ${reqPk}, ${conPk}, ${text(note, 1000)}, 'DRAFT'
    )
    RETURNING *
  `;
  return rows[0];
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

async function updateList(listPk, fields) {
  const pk = toBigInt(listPk);
  const status = fields.status;
  const note = fields.note;
  const storePk = fields.storePk === undefined ? undefined : fields.storePk;
  const rows = await prisma.$queryRawUnsafe(
    `UPDATE material_requirement_lists
     SET status = COALESCE($2, status),
         note = COALESCE($3, note),
         store_id = CASE WHEN $4::int = 1 THEN $5::bigint ELSE store_id END,
         updated_at = now()
     WHERE id = $1::bigint
     RETURNING *`,
    pk,
    status || null,
    note == null ? null : text(note, 1000),
    storePk === undefined ? 0 : 1,
    storePk ? toBigInt(storePk) : null
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

module.exports = {
  newId,
  findByPublicId,
  findActiveByRequest,
  listByContractor,
  listByStore,
  insertList,
  insertItem,
  updateItem,
  deleteItem,
  updateList,
  insertQuote,
  updateQuoteStatus,
  userPk,
  requestRow,
  storeRow,
  tablesReady,
  loadItems,
  hydrate,
};
