const { ApiError } = require('../utils/ApiError');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { STORE_TYPE } = require('../models/Store');
const { ROLES } = require('../models/User');
const { Store } = require('../repositories/partnerAccess');
const marketplaceService = require('./marketplaceService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { roundVnd } = require('../utils/contractor-finance');
const repo = require('../repositories/materialRequirement.postgres');
const {
  MRL_STATUS,
  MATERIAL_QUOTE_STATUS,
  canEditItems,
  canSend,
  canCancel,
  canQuote,
  canConfirmQuote,
  assertItem,
  quoteTotal,
} = require('../utils/material-requirement.rules');

const replayLocks = new Map();

async function withLock(key, work) {
  const pending = replayLocks.get(key);
  if (pending) return pending;
  const next = Promise.resolve()
    .then(work)
    .finally(() => replayLocks.delete(key));
  replayLocks.set(key, next);
  return next;
}

async function ensureTables() {
  const ready = await repo.tablesReady().catch(() => false);
  if (!ready) {
    throw new ApiError(503, 'Material Requirement List is not installed on this database');
  }
}

function contractorPkOf(user) {
  return repo.userPk(user.id);
}

async function loadOwnedList(id, user) {
  await ensureTables();
  const list = await repo.findByPublicId(id);
  if (!list) throw new ApiError(404, 'Material requirement list not found');
  const contractor = String(user.id) === String(list.contractorId);
  const storeOwner = user.role === ROLES.MATERIAL_STORE_OWNER && list.storeId;
  if (user.role === ROLES.CONTRACTOR && !contractor) {
    throw new ApiError(403, 'You cannot access this list');
  }
  if (user.role === ROLES.MATERIAL_STORE_OWNER) {
    const store = await Store.findOne({ contractorId: user.id });
    if (!store || String(store._id) !== String(list.storeId)) {
      throw new ApiError(403, 'You cannot access this list');
    }
  }
  if (user.role === ROLES.CUSTOMER) {
    throw new ApiError(403, 'Customers cannot manage material requirement lists');
  }
  if (user.role === ROLES.ADMIN) return list;
  if (!contractor && !storeOwner && user.role !== ROLES.ADMIN) {
    throw new ApiError(403, 'You cannot access this list');
  }
  return list;
}

async function createList(user, payload) {
  if (user.role !== ROLES.CONTRACTOR) {
    throw new ApiError(403, 'Only contractors can create a material requirement list');
  }
  await ensureTables();
  const request = await repo.requestRow(payload.requestId);
  if (!request) throw new ApiError(404, 'Repair request not found');
  const contractorPk = await repo.userPk(user.id);
  if (!contractorPk || request.contractor_user_id !== contractorPk) {
    throw new ApiError(403, 'You cannot add a material list to this request');
  }
  if (request.status === REQUEST_STATUS.PENDING) {
    throw new ApiError(409, 'Accept the repair request before creating a material list');
  }
  if (request.status === REQUEST_STATUS.REJECTED || request.status === REQUEST_STATUS.CANCELLED) {
    throw new ApiError(409, 'This request cannot receive a material list');
  }
  const existing = await repo.findActiveByRequest(request.id);
  if (existing) return existing;
  const created = await repo.insertList({
    requestPk: request.id,
    contractorPk,
    note: payload.note || '',
  });
  const items = payload.items || [];
  for (let i = 0; i < items.length; i += 1) {
    await repo.insertItem(created.id, assertItem(items[i]), i);
  }
  return repo.findByPublicId(created.legacy_mongo_id);
}

async function listMine(user, filters = {}) {
  await ensureTables();
  const repairRequestId = String(filters.repairRequestId || '').trim();
  let lists;
  if (user.role === ROLES.CONTRACTOR) {
    const pk = await repo.userPk(user.id);
    lists = await repo.listByContractor(pk);
  } else if (user.role === ROLES.MATERIAL_STORE_OWNER) {
    const store = await Store.findOne({ contractorId: user.id });
    if (!store) return [];
    const row = await repo.storeRow(String(store._id));
    if (!row) return [];
    lists = await repo.listByStore(row.id);
  } else {
    throw new ApiError(403, 'You cannot list material requirement lists');
  }
  if (!repairRequestId) return lists;
  return lists.filter((list) => String(list.requestId) === repairRequestId);
}

async function getOne(user, id) {
  return loadOwnedList(id, user);
}

async function addItem(user, id, payload) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can edit items');
  const list = await loadOwnedList(id, user);
  if (String(list.contractorId) !== String(user.id)) throw new ApiError(403, 'You cannot edit this list');
  if (!canEditItems(list.status)) throw new ApiError(409, 'Items can only be edited while the list is a draft');
  const item = assertItem(payload);
  const row = await repo.findByPublicId(id);
  const pkRows = await repo.findByPublicId(id);
  const internal = await require('../config/prisma').prisma.$queryRaw`
    SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${list.id} LIMIT 1
  `;
  const listPk = internal[0]?.id;
  if (!listPk) throw new ApiError(404, 'Material requirement list not found');
  if ((pkRows.items || []).length >= 40) throw new ApiError(422, 'Too many items on this list');
  await repo.insertItem(listPk, item, (row.items || []).length);
  return repo.findByPublicId(id);
}

async function updateItem(user, id, itemId, payload) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can edit items');
  const list = await loadOwnedList(id, user);
  if (!canEditItems(list.status)) throw new ApiError(409, 'Items can only be edited while the list is a draft');
  const item = assertItem(payload);
  const current = list.items.find((row) => String(row.id) === String(itemId));
  if (!current) throw new ApiError(404, 'Item not found');
  await repo.updateItem(BigInt(itemId), item);
  return repo.findByPublicId(id);
}

async function removeItem(user, id, itemId) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can edit items');
  const list = await loadOwnedList(id, user);
  if (!canEditItems(list.status)) throw new ApiError(409, 'Items can only be edited while the list is a draft');
  const current = list.items.find((row) => String(row.id) === String(itemId));
  if (!current) throw new ApiError(404, 'Item not found');
  const internal = await require('../config/prisma').prisma.$queryRaw`
    SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${list.id} LIMIT 1
  `;
  await repo.deleteItem(BigInt(itemId), internal[0].id);
  return repo.findByPublicId(id);
}

async function sendToStore(user, id, storeId) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can send a material list');
  return withLock(`send:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    if (!canSend(list.status, list.items.length)) {
      throw new ApiError(409, 'Add at least one item before sending this list');
    }
    const store = await marketplaceService.assertApprovedLiveStore(storeId);
    if (!store) throw new ApiError(409, 'This store is not available on the marketplace');
    if (store.storeType !== STORE_TYPE.MATERIALS && store.storeType !== STORE_TYPE.BOTH) {
      throw new ApiError(409, 'Only a material store can receive this list');
    }
    const storeRow = await repo.storeRow(String(store._id));
    if (!storeRow) throw new ApiError(404, 'Store not found');
    const internal = await require('../config/prisma').prisma.$queryRaw`
      SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${list.id} LIMIT 1
    `;
    await repo.updateList(internal[0].id, { status: MRL_STATUS.SENT, storePk: storeRow.id });
    await notify({
      userId: String(store.contractorId),
      title: 'Material requirement list',
      message: 'A contractor sent a material requirement list',
      type: NOTIFICATION_TYPE.STATUS_UPDATE,
      link: `/store/material-requests/${list.id}`,
      meta: { materialRequirementId: list.id },
    }).catch(() => null);
    return repo.findByPublicId(id);
  });
}

async function cancelList(user, id) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can cancel this list');
  return withLock(`cancel:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    if (!canCancel(list.status)) throw new ApiError(409, 'This list can no longer be cancelled');
    const internal = await require('../config/prisma').prisma.$queryRaw`
      SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${list.id} LIMIT 1
    `;
    await repo.updateList(internal[0].id, { status: MRL_STATUS.CANCELLED });
    return repo.findByPublicId(id);
  });
}

function toMatch(row) {
  return {
    materialId: row.id,
    name: row.name,
    unit: row.unit,
    price: row.price,
    stock: row.stock,
    storeId: row.storeId,
    storeName: row.store?.name || '',
    city: row.store?.city || '',
    image: row.image || '',
  };
}

async function collectPublicMaterials(list) {
  const names = (list.items || []).map((item) => item.name).filter(Boolean).slice(0, 6);
  const queries = names.length ? [...names, ''] : [''];
  const seen = new Set();
  const matches = [];
  for (const name of queries) {
    const rows = await marketplaceService.searchMaterials(name ? { keyword: name } : {});
    for (const row of rows) {
      const key = `${row.storeId}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(toMatch(row));
    }
  }
  return matches.slice(0, 40);
}

async function suggestCatalog(user, id) {
  const list = await loadOwnedList(id, user);
  return collectPublicMaterials(list);
}

async function listEligibleStores(user, id) {
  const list = await loadOwnedList(id, user);
  const matches = await collectPublicMaterials(list);
  const byStore = new Map();
  for (const row of matches) {
    if (!row.storeId || byStore.has(row.storeId)) continue;
    const live = await marketplaceService.assertApprovedLiveStore(row.storeId);
    if (!live) continue;
    if (live.storeType !== STORE_TYPE.MATERIALS && live.storeType !== STORE_TYPE.BOTH) continue;
    byStore.set(row.storeId, {
      storeId: row.storeId,
      name: row.storeName || live.name,
      city: row.city || live.city || '',
      sampleMaterial: row.name,
      samplePrice: row.price,
    });
  }
  return [...byStore.values()];
}

async function createStoreQuote(user, id, payload) {
  if (user.role !== ROLES.MATERIAL_STORE_OWNER) {
    throw new ApiError(403, 'Only the material store can send this quote');
  }
  return withLock(`quote:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    if (!canQuote(list.status)) throw new ApiError(409, 'This list is not waiting for a quote');
    const store = await Store.findOne({ contractorId: user.id });
    if (!store || String(store._id) !== String(list.storeId)) {
      throw new ApiError(403, 'You cannot quote this list');
    }
    const incoming = new Map((payload.items || []).map((row) => [String(row.itemId), row]));
    if (incoming.size !== list.items.length) {
      throw new ApiError(422, 'Quote must include every item on the list');
    }
    const lines = [];
    for (const item of list.items) {
      const row = incoming.get(String(item.id));
      if (!row) throw new ApiError(422, 'Quote must include every item on the list');
      if (Number(row.unitPrice) < 0 || Number(row.availableQty) < 0) {
        throw new ApiError(422, 'Quote amounts cannot be negative');
      }
      lines.push({
        itemPk: BigInt(item.id),
        unitPrice: roundVnd(row.unitPrice),
        availableQty: Number(row.availableQty),
        note: row.note || '',
      });
    }
    const storeRow = await repo.storeRow(String(store._id));
    const storeUserPk = await repo.userPk(user.id);
    const internal = await require('../config/prisma').prisma.$queryRaw`
      SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${list.id} LIMIT 1
    `;
    await repo.insertQuote({
      listPk: internal[0].id,
      storePk: storeRow.id,
      storeUserPk,
      deliveryFee: payload.deliveryFee || 0,
      note: payload.note || '',
      lines,
    });
    await repo.updateList(internal[0].id, { status: MRL_STATUS.QUOTED });
    await notify({
      userId: String(list.contractorId),
      title: 'Material quote received',
      message: store.name || 'Material store',
      type: NOTIFICATION_TYPE.QUOTATION,
      link: `/contractor/material-requirements/${list.id}`,
      meta: { materialRequirementId: list.id, total: quoteTotal(list.items.map((item, index) => ({
        quantity: item.quantity,
        unitPrice: lines[index].unitPrice,
      })), payload.deliveryFee || 0) },
    }).catch(() => null);
    return repo.findByPublicId(id);
  });
}

async function confirmQuote(user, id) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can confirm a material quote');
  return withLock(`confirm:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    const quote = (list.quotes || [])[0];
    if (!quote || !canConfirmQuote(list.status, quote.status)) {
      throw new ApiError(409, 'There is no material quote to confirm');
    }
    const internal = await require('../config/prisma').prisma.$queryRaw`
      SELECT id FROM material_requirement_lists WHERE legacy_mongo_id = ${list.id} LIMIT 1
    `;
    const quoteRow = await require('../config/prisma').prisma.$queryRaw`
      SELECT id FROM material_quotes WHERE legacy_mongo_id = ${quote.id} LIMIT 1
    `;
    await repo.updateQuoteStatus(quoteRow[0].id, MATERIAL_QUOTE_STATUS.ACCEPTED);
    await repo.updateList(internal[0].id, { status: MRL_STATUS.CONFIRMED });
    if (list.storeId) {
      const store = await Store.findById(list.storeId);
      if (store?.contractorId) {
        await notify({
          userId: String(store.contractorId),
          title: 'Material quote confirmed',
          message: 'The contractor confirmed your material quote',
          type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
          link: `/store/material-requests/${list.id}`,
          meta: { materialRequirementId: list.id },
        }).catch(() => null);
      }
    }
    return repo.findByPublicId(id);
  });
}

module.exports = {
  createList,
  listMine,
  getOne,
  addItem,
  updateItem,
  removeItem,
  sendToStore,
  cancelList,
  suggestCatalog,
  createStoreQuote,
  confirmQuote,
  listEligibleStores,
  MRL_STATUS,
};
