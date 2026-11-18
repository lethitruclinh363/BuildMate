const { ApiError } = require('../utils/ApiError');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { QUOTATION_STATUS } = require('../models/Quotation');
const { STORE_TYPE } = require('../models/Store');
const { ROLES } = require('../models/User');
const { Store } = require('../repositories/partnerAccess');
const { Quotation, ChatRoom } = require('../repositories/conversationAccess');
const marketplaceService = require('./marketplaceService');
const chatService = require('./chatService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { ROOM_KIND } = require('../utils/chat-room.rules');
const { emitToUser } = require('./socketService');
const { encodeMrlChat, requestPayload, quotePayload, confirmedPayload, rejectedPayload } = require('../utils/mrl-chat');
const { roundVnd } = require('../utils/contractor-finance');
const repo = require('../repositories/materialRequirement.postgres');
const {
  MRL_STATUS,
  MATERIAL_QUOTE_STATUS,
  canEditItems,
  canCancel,
  canQuote,
  canConfirmQuote,
  isFulfillmentStatus,
  assertItem,
  assertContractorItem,
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
  await repo.ensureFulfillmentConstraint().catch(() => false);
  await repo.ensureCustomerSaveSchema().catch(() => false);
  await repo.ensureDirectRequestSchema().catch(() => false);
}

function storeOwnerPublicId(store, storeRow) {
  return String(store?.contractorId || storeRow?.owner_legacy_id || '');
}

async function notifyStoreOfRequest(store, storeRow, list) {
  const userId = storeOwnerPublicId(store, storeRow);
  if (!userId || !list?.id) return;
  await notify({
    userId,
    title: 'Material requirement list',
    message: 'A customer sent a material requirement list',
    type: NOTIFICATION_TYPE.STATUS_UPDATE,
    link: `/store/material-requests/${list.id}`,
    meta: { materialRequirementId: list.id, dedupeKey: `mrl-request:${list.id}` },
  });
}

async function emitMrlUpdate(list) {
  if (!list) return;
  emitToUser(String(list.customerId), 'mrl:update', list);
  if (list.storeId) {
    try {
      const store = await Store.findById(list.storeId);
      const ownerId = storeOwnerPublicId(store);
      if (ownerId) emitToUser(ownerId, 'mrl:update', list);
    } catch {
      /* ignore lookup failure during socket emission */
    }
  }
}

async function listPkOrThrow(publicId) {
  const pk = await repo.listPkByPublicId(publicId);
  if (!pk) throw new ApiError(404, 'Material requirement list not found');
  return pk;
}

async function postStoreChat(list, senderId, payload, preview) {
  if (!list?.storeId || !senderId) return;
  const room = await ChatRoom.findOne({
    customerId: list.customerId,
    storeId: list.storeId,
    roomKind: ROOM_KIND.CUSTOMER_MATERIAL_STORE,
  });
  if (!room) return;
  await chatService.sendMessage({
    roomId: room.id || room._id,
    senderId,
    content: encodeMrlChat(payload, preview),
  });
}

function contractorPkOf(user) {
  return repo.userPk(user.id);
}

function sameId(left, right) {
  return String(left || '') === String(right || '');
}

async function loadOwnedList(id, user) {
  await ensureTables();
  const list = await repo.findByPublicId(id);
  if (!list) throw new ApiError(404, 'Material requirement list not found');
  if (user.role === ROLES.ADMIN) return list;
  if (user.role === ROLES.CONTRACTOR) {
    if (!sameId(user.id, list.contractorId)) throw new ApiError(403, 'You cannot access this list');
    return list;
  }
  if (user.role === ROLES.CUSTOMER) {
    if (!sameId(user.id, list.customerId)) throw new ApiError(403, 'You cannot access this list');
    return list;
  }
  if (user.role === ROLES.MATERIAL_STORE_OWNER) {
    const store = await Store.findOne({ contractorId: user.id });
    if (!store || !sameId(store._id, list.storeId)) {
      throw new ApiError(403, 'You cannot access this list');
    }
    return list;
  }
  throw new ApiError(403, 'You cannot access this list');
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
  return withLock(`mrl:${request.id}:${contractorPk}`, async () => {
    const existing = await repo.findActiveByRequest(request.id);
    if (existing) {
      if (canEditItems(existing.status) && Array.isArray(payload.items)) {
        const pk = await repo.listPkByPublicId(existing.id);
        if (!pk) throw new ApiError(404, 'Material requirement list not found');
        const nextItems = payload.items.map((row) => assertContractorItem(row));
        if (nextItems.length > 40) throw new ApiError(422, 'Too many items on this list');
        await repo.replaceItems(pk, nextItems);
        if (payload.note) await repo.updateList(pk, { note: payload.note });
        return repo.findByPublicId(existing.id);
      }
      return existing;
    }

    const created = await repo.insertList({
      requestPk: request.id,
      contractorPk,
      customerPk: request.customer_user_id,
      note: payload.note || '',
    });
    const items = payload.items || [];
    for (let i = 0; i < items.length; i += 1) {
      await repo.insertItem(created.id, assertContractorItem(items[i]), i);
    }
    return repo.findByPublicId(created.legacy_mongo_id);
  });
}

async function listMine(user, filters = {}) {
  await ensureTables();
  const repairRequestId = String(filters.repairRequestId || '').trim();
  let lists;
  if (user.role === ROLES.CONTRACTOR) {
    const pk = await repo.userPk(user.id);
    lists = await repo.listByContractor(pk);
  } else if (user.role === ROLES.CUSTOMER) {
    const pk = await repo.userPk(user.id);
    lists = await repo.listByCustomer(pk);
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

async function createDirectRequest(user, payload) {
  if (user.role !== ROLES.CUSTOMER) {
    throw new ApiError(403, 'Only customers can send a direct material request');
  }
  await ensureTables();
  const items = (payload.items || []).map((row) => assertItem(row));
  if (!items.length) throw new ApiError(422, 'Add at least one item before sending this list');
  if (items.length > 40) throw new ApiError(422, 'Too many items on this list');
  const store = await marketplaceService.assertApprovedLiveStore(payload.storeId);
  if (!store) throw new ApiError(409, 'This store is not available on the marketplace');
  if (store.storeType !== STORE_TYPE.MATERIALS && store.storeType !== STORE_TYPE.BOTH) {
    throw new ApiError(409, 'Only a material store can receive this list');
  }
  const customerPk = await repo.userPk(user.id);
  if (!customerPk) throw new ApiError(404, 'Customer not found');
  const storeRow = await repo.storeRow(String(store._id));
  if (!storeRow) throw new ApiError(404, 'Store not found');
  return withLock(`direct:${user.id}:${store._id}:${items[0].name}`, async () => {
    const created = await repo.insertList({
      requestPk: null,
      contractorPk: null,
      customerPk,
      note: payload.note || '',
      title: payload.title || items[0].name,
      status: MRL_STATUS.SENT,
      storePk: storeRow.id,
    });
    for (let i = 0; i < items.length; i += 1) {
      await repo.insertItem(created.id, items[i], i);
    }
    const latest = await repo.findByPublicId(created.legacy_mongo_id);
    await notifyStoreOfRequest(store, storeRow, latest).catch(() => null);
    try {
      await chatService.createRoomForStore(user, String(store._id));
      await postStoreChat(latest, user.id, requestPayload(latest), 'Material quote request');
    } catch {
      /* List is already assigned if chat cannot send. */
    }
    await emitMrlUpdate(latest);
    return latest;
  });
}

async function addItem(user, id, payload) {
  if (user.role !== ROLES.CONTRACTOR) throw new ApiError(403, 'Only contractors can edit items');
  const list = await loadOwnedList(id, user);
  if (String(list.contractorId) !== String(user.id)) throw new ApiError(403, 'You cannot edit this list');
  if (!canEditItems(list.status)) throw new ApiError(409, 'Items can only be edited while the list is a draft');
  const item = assertContractorItem(payload);
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
  const list = await loadOwnedList(id, user);
  if (!canEditItems(list.status)) throw new ApiError(409, 'Items can only be edited while the list is a draft');
  const current = list.items.find((row) => String(row.id) === String(itemId));
  if (!current) throw new ApiError(404, 'Item not found');
  if (user.role === ROLES.CONTRACTOR) {
    if (!sameId(list.contractorId, user.id) || list.kind === 'SAVED') {
      throw new ApiError(403, 'You cannot edit this list');
    }
    await repo.updateItem(BigInt(itemId), assertContractorItem(payload));
    return repo.findByPublicId(id);
  }
  if (user.role === ROLES.CUSTOMER) {
    if (list.kind !== 'SAVED') {
      throw new ApiError(409, 'Save a copy before editing quantities or notes');
    }
    const item = assertItem({
      name: current.name,
      specification: current.specification,
      unit: current.unit,
      quantity: payload.quantity,
      notes: payload.notes,
    });
    await repo.updateItem(BigInt(itemId), {
      name: current.name,
      specification: current.specification || '',
      unit: current.unit || '',
      quantity: item.quantity,
      notes: item.notes,
    });
    return repo.findByPublicId(id);
  }
  throw new ApiError(403, 'Only contractors can edit items');
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

async function saveForCustomer(user, id) {
  if (user.role !== ROLES.CUSTOMER) throw new ApiError(403, 'Only the customer can save this material list');
  return withLock(`save:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    if (list.kind === 'SAVED' && list.status === MRL_STATUS.DRAFT) return list;
    const sourceId = list.parentListId || list.id;
    const sourcePk = await listPkOrThrow(sourceId);
    const existing = await repo.findSavedDraft(sourcePk);
    if (existing) return existing;
    try {
      const created = await repo.cloneList({
        sourcePk: await listPkOrThrow(list.id),
        parentPk: sourcePk,
        status: MRL_STATUS.DRAFT,
        title: list.title || list.requestTitle || '',
        note: list.note || '',
      });
      return repo.findByPublicId(created.legacy_mongo_id);
    } catch (err) {
      const replay = await repo.findSavedDraft(sourcePk);
      if (replay) return replay;
      throw err;
    }
  });
}

async function updateSavedMeta(user, id, payload) {
  if (user.role !== ROLES.CUSTOMER) throw new ApiError(403, 'Only the customer can rename this list');
  const list = await loadOwnedList(id, user);
  if (list.kind !== 'SAVED' || list.status !== MRL_STATUS.DRAFT) {
    throw new ApiError(409, 'Only a saved draft can be renamed');
  }
  const pk = await listPkOrThrow(list.id);
  await repo.updateList(pk, {
    title: payload.title == null ? undefined : payload.title,
    note: payload.note == null ? undefined : payload.note,
  });
  return repo.findByPublicId(id);
}

async function sendToStore(user, id, storeId) {
  if (user.role !== ROLES.CUSTOMER) throw new ApiError(403, 'Only the customer can send a material list to a store');
  return withLock(`send:${id}:${storeId}`, async () => {
    const list = await loadOwnedList(id, user);
    if (list.requestId) {
      const acceptedQuote = await Quotation.findOne({
        requestId: list.requestId,
        status: QUOTATION_STATUS.ACCEPTED,
      }).select('_id');
      if (!acceptedQuote) {
        throw new ApiError(409, 'Accept the construction quotation before sending this list to a store');
      }
    }
    const store = await marketplaceService.assertApprovedLiveStore(storeId);
    if (!store) throw new ApiError(409, 'This store is not available on the marketplace');
    if (store.storeType !== STORE_TYPE.MATERIALS && store.storeType !== STORE_TYPE.BOTH) {
      throw new ApiError(409, 'Only a material store can receive this list');
    }
    if (list.status !== MRL_STATUS.CANCELLED && sameId(list.storeId, store._id)) {
      return list;
    }
    const saved = await saveForCustomer(user, list.kind === 'SAVED' ? list.id : (list.parentListId || list.id));
    if (!(saved.items || []).length) {
      throw new ApiError(409, 'Add at least one item before sending this list');
    }
    const storeRow = await repo.storeRow(String(store._id));
    if (!storeRow) throw new ApiError(404, 'Store not found');
    const savedPk = await listPkOrThrow(saved.id);
    const sourcePk = await listPkOrThrow(saved.parentListId || list.id);
    const existing = await repo.findRequestForStore({
      parentPk: savedPk,
      sourcePk,
      storePk: storeRow.id,
    });
    if (existing) return existing;
    let snapshot;
    try {
      snapshot = await repo.cloneList({
        sourcePk: savedPk,
        parentPk: savedPk,
        status: MRL_STATUS.SENT,
        storePk: storeRow.id,
        title: saved.title,
        note: saved.note,
      });
    } catch (err) {
      const replay = await repo.findRequestForStore({
        parentPk: savedPk,
        sourcePk,
        storePk: storeRow.id,
      });
      if (replay) return replay;
      throw err;
    }
    const latest = await repo.findByPublicId(snapshot.legacy_mongo_id);
    await notifyStoreOfRequest(store, storeRow, latest).catch(() => null);
    try {
      await chatService.createRoomForStore(user, String(store._id));
      await postStoreChat(latest, user.id, requestPayload(latest), 'Material quote request');
    } catch {
      /* List is already assigned if chat cannot send. */
    }
    await emitMrlUpdate(latest);
    return latest;
  });
}

async function cancelList(user, id) {
  if (user.role !== ROLES.CONTRACTOR && user.role !== ROLES.CUSTOMER && user.role !== ROLES.MATERIAL_STORE_OWNER) {
    throw new ApiError(403, 'You cannot cancel this list');
  }
  return withLock(`cancel:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    if (user.role === ROLES.CONTRACTOR && list.status !== MRL_STATUS.DRAFT) {
      throw new ApiError(409, 'This list can no longer be cancelled');
    }
    if (user.role === ROLES.MATERIAL_STORE_OWNER && list.status !== MRL_STATUS.CONFIRMED) {
      throw new ApiError(409, 'This list can no longer be cancelled');
    }
    if (user.role === ROLES.CUSTOMER) {
      if (list.kind === 'SOURCE') {
        throw new ApiError(403, 'The contractor material list cannot be cancelled by the customer');
      }
      if (list.status !== MRL_STATUS.DRAFT && list.status !== MRL_STATUS.SENT && list.status !== MRL_STATUS.CONFIRMED) {
        throw new ApiError(409, 'This list can no longer be cancelled');
      }
    }
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
    const existingQuote = (list.quotes || []).find((q) => q.status === MATERIAL_QUOTE_STATUS.SENT);
    if (!canQuote(list.status)) {
      if (list.status === MRL_STATUS.QUOTED && existingQuote) {
        const quoteRow = await repo.findQuotePk(existingQuote.id);
        if (quoteRow) {
          const incoming = new Map((payload.items || []).map((row) => [String(row.itemId), row]));
          if (incoming.size !== list.items.length) {
            throw new ApiError(422, 'Quote must include every item on the list');
          }
          const lines = [];
          for (const item of list.items) {
            const row = incoming.get(String(item.id));
            if (!row) throw new ApiError(422, 'Quote must include every item on the list');
            if (Number(row.unitPrice) < 0) throw new ApiError(422, 'Quote amounts cannot be negative');
            if (Number(row.availableQty) < 0) throw new ApiError(422, 'Quantity cannot be negative');
            lines.push({
              itemPk: BigInt(item.id),
              unitPrice: roundVnd(row.unitPrice),
              availableQty: Number(row.availableQty),
              note: row.note || '',
            });
          }
          await repo.updateQuote(quoteRow.id, {
            deliveryFee: payload.deliveryFee || 0,
            note: payload.note || '',
            lines,
          });
          const total = quoteTotal(lines.map((line) => ({
            availableQty: line.availableQty,
            unitPrice: line.unitPrice,
          })), payload.deliveryFee || 0);
          const latest = await repo.findByPublicId(id);
          await postStoreChat(latest, user.id, quotePayload(latest, latest.quotes?.[0], total), 'Material quote').catch(() => null);
          await emitMrlUpdate(latest);
          return latest;
        }
      }
      throw new ApiError(409, 'This list is not waiting for a quote');
    }
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
      if (Number(row.unitPrice) < 0) {
        throw new ApiError(422, 'Quote amounts cannot be negative');
      }
      if (Number(row.availableQty) < 0) {
        throw new ApiError(422, 'Quantity cannot be negative');
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
    const total = quoteTotal(lines.map((line) => ({
      availableQty: line.availableQty,
      unitPrice: line.unitPrice,
    })), payload.deliveryFee || 0);
    await notify({
      userId: String(list.customerId),
      title: 'Material quote received',
      message: store.name || 'Material store',
      type: NOTIFICATION_TYPE.QUOTATION,
      link: `/customer/chat`,
      meta: { materialRequirementId: list.id, total },
    }).catch(() => null);
    const latest = await repo.findByPublicId(id);
    await postStoreChat(latest, user.id, quotePayload(latest, latest.quotes?.[0], total), 'Material quote').catch(() => null);
    await emitMrlUpdate(latest);
    return latest;
  });
}

async function confirmQuote(user, id) {
  if (user.role !== ROLES.CUSTOMER) throw new ApiError(403, 'Only the customer can confirm a material quote');
  return withLock(`confirm:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    if (isFulfillmentStatus(list.status)) return list;
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
          message: 'The customer confirmed your material quote',
          type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
          link: `/store/material-requests/${list.id}`,
          meta: { materialRequirementId: list.id },
        }).catch(() => null);
      }
    }
    const latest = await repo.findByPublicId(id);
    await postStoreChat(latest, user.id, confirmedPayload(latest), 'Material quote confirmed').catch(() => null);
    await emitMrlUpdate(latest);
    return latest;
  });
}

async function rejectQuote(user, id) {
  if (user.role !== ROLES.CUSTOMER) throw new ApiError(403, 'Only the customer can reject a material quote');
  return withLock(`reject:${id}`, async () => {
    const list = await loadOwnedList(id, user);
    const quote = (list.quotes || [])[0];
    if (!quote || !canConfirmQuote(list.status, quote.status)) {
      throw new ApiError(409, 'There is no material quote to reject');
    }
    const pk = await listPkOrThrow(id);
    const quoteRow = await require('../config/prisma').prisma.$queryRaw`
      SELECT id FROM material_quotes WHERE legacy_mongo_id = ${quote.id} LIMIT 1
    `;
    await repo.updateQuoteStatus(quoteRow[0].id, MATERIAL_QUOTE_STATUS.REJECTED);
    await repo.updateList(pk, { status: MRL_STATUS.SENT });
    if (list.storeId) {
      const store = await Store.findById(list.storeId);
      if (store?.contractorId) {
        await notify({
          userId: String(store.contractorId),
          title: 'Material quote rejected',
          message: 'The customer rejected your material quote',
          type: NOTIFICATION_TYPE.STATUS_UPDATE,
          link: `/store/material-requests/${list.id}`,
          meta: { materialRequirementId: list.id },
        }).catch(() => null);
      }
    }
    const latest = await repo.findByPublicId(id);
    await postStoreChat(latest, user.id, rejectedPayload(latest), 'Material quote rejected').catch(() => null);
    await emitMrlUpdate(latest);
    return latest;
  });
}

async function advanceFulfillment(_user, _id, _status) {
  throw new ApiError(410, 'Material delivery tracking is no longer available');
}

module.exports = {
  createList,
  createDirectRequest,
  listMine,
  getOne,
  addItem,
  updateItem,
  removeItem,
  saveForCustomer,
  updateSavedMeta,
  sendToStore,
  cancelList,
  suggestCatalog,
  createStoreQuote,
  confirmQuote,
  rejectQuote,
  advanceFulfillment,
  listEligibleStores,
  MRL_STATUS,
};
