const { QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../models/Quotation');
const { REQUEST_STATUS } = require('../models/RepairRequest');
const { Quotation, RepairRequest, ChatRoom } = require('../repositories/conversationAccess');
const { runInTransaction, postgres } = require('../repositories/commerceAccess');
const { ApiError } = require('../utils/ApiError');
const { sendMessage, MESSAGE_TYPE } = require('./chatService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const orderService = require('./orderService');
const { roundVnd } = require('../utils/contractor-finance');
const { materialListForRequest, withMaterialList } = require('../utils/quotation-materials');

const REPLAY_WINDOW_MS = 45 * 1000;
const replayLocks = new Map();

function lineQty(item) {
  if (item == null || item.quantity == null || item.quantity === '') return 1;
  const qty = Number(item.quantity);
  return Number.isFinite(qty) ? qty : 0;
}

function estimatedDaysOf(value) {
  if (value == null || value === '') return 1;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 180) {
    throw new ApiError(422, 'Estimated days must be an integer from 1 to 180');
  }
  return days;
}

function lineAmount(item) {
  return roundVnd(lineQty(item) * Number(item.price || 0));
}

function tally(items = [], transportCost = 0) {
  const materialCost = items
    .filter((i) => i.type === QUOTE_ITEM_TYPE.MATERIAL)
    .reduce((sum, i) => sum + lineAmount(i), 0);
  const laborCost = items
    .filter((i) => i.type === QUOTE_ITEM_TYPE.LABOR)
    .reduce((sum, i) => sum + lineAmount(i), 0);
  const transport = roundVnd(transportCost);
  return {
    materialCost,
    laborCost,
    transportCost: transport,
    totalCost: materialCost + laborCost + transport,
  };
}

function itemsKey(items = []) {
  return (items || [])
    .map((item) =>
      [
        item.type || '',
        String(item.name || '').trim().toLowerCase(),
        lineQty(item),
        Number(item.price || 0),
        String(item.unit || '').trim().toLowerCase(),
      ].join(':')
    )
    .join('|');
}

function quoteReplayFingerprint(contractorId, payload = {}) {
  return [
    String(contractorId),
    String(payload.requestId || ''),
    itemsKey(payload.items),
    roundVnd(payload.transportCost),
    Number(payload.estimatedDays || 1),
    String(payload.note || '').trim(),
  ].join('|');
}

function isQuoteReplay(row, payload, now = Date.now()) {
  if (!row?.createdAt) return false;
  if (now - new Date(row.createdAt).getTime() > REPLAY_WINDOW_MS) return false;
  if (row.status === QUOTATION_STATUS.ACCEPTED) return false;
  return (
    itemsKey(row.items) === itemsKey(payload.items)
    && roundVnd(row.transportCost) === roundVnd(payload.transportCost)
    && String(row.note || '').trim() === String(payload.note || '').trim()
  );
}

async function withReplayLock(key, work) {
  const pending = replayLocks.get(key);
  if (pending) return pending;
  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      replayLocks.delete(key);
    });
  replayLocks.set(key, next);
  return next;
}

async function createQuotation(contractorId, payload) {
  const request = await RepairRequest.findById(payload.requestId);
  if (!request) throw new ApiError(404, 'Repair request not found');
  if (String(request.contractorId) !== String(contractorId)) {
    throw new ApiError(403, 'You cannot quote this request');
  }
  if (request.status === REQUEST_STATUS.REJECTED) {
    throw new ApiError(409, 'This request was rejected');
  }
  if (request.status === REQUEST_STATUS.CANCELLED) {
    throw new ApiError(409, 'This request was cancelled');
  }
  if (request.status === REQUEST_STATUS.COMPLETED) {
    throw new ApiError(409, 'This request is already completed');
  }
  if (request.status !== REQUEST_STATUS.ACCEPTED) {
    throw new ApiError(409, 'Accept this request before sending a quotation');
  }
  const acceptedQuote = await Quotation.findOne({
    requestId: request._id,
    status: QUOTATION_STATUS.ACCEPTED,
  }).select('_id');
  if (acceptedQuote) {
    throw new ApiError(409, 'A quotation was already accepted');
  }

  const items = (payload.items || []).map((item) => ({
    ...item,
    catalogId: item.catalogId || null,
  }));
  if (items.some((item) => item.type && item.type !== QUOTE_ITEM_TYPE.LABOR)) {
    throw new ApiError(422, 'Construction quotations cannot include material prices');
  }
  if (!items.length) throw new ApiError(422, 'Add at least one line item');
  const costs = tally(items, payload.transportCost || 0);
  if (costs.totalCost <= 0) {
    throw new ApiError(422, 'Quotation total must be greater than zero');
  }

  return withReplayLock(quoteReplayFingerprint(contractorId, payload), async () => {
    const recent = await Quotation.find({ contractorId, requestId: request._id }).sort({ createdAt: -1 }).limit(5);
    const replayed = recent.find((row) => isQuoteReplay(row, payload));
    if (replayed) return withMaterialList(replayed.toPublic());

    const room = await ChatRoom.findOne({ requestId: request._id });
    const quotation = await Quotation.create({
      requestId: request._id,
      customerId: request.customerId,
      contractorId,
      roomId: room?._id || null,
      items,
      ...costs,
      estimatedDays: estimatedDaysOf(payload.estimatedDays),
      note: payload.note || '',
      status: QUOTATION_STATUS.SENT,
    });

    const materialList = await materialListForRequest(request._id);
    let chatContent = `Quotation ${costs.totalCost.toLocaleString('vi-VN')}đ`;
    if (materialList.length) {
      chatContent += `\nMaterial list ${materialList.length}`;
    }

    if (room) {
      await sendMessage({
        roomId: room._id,
        senderId: contractorId,
        type: MESSAGE_TYPE.QUOTATION,
        content: chatContent,
        quotationId: quotation._id,
      });
    }

    await notify({
      userId: request.customerId,
      title: 'New quotation',
      message: `${request.title} · ${costs.totalCost.toLocaleString('vi-VN')}đ`,
      type: NOTIFICATION_TYPE.QUOTATION,
      link: `/customer/quotation/${quotation._id}`,
      meta: { quotationId: String(quotation._id), requestId: String(request._id) },
    });
    await writeAudit({
      actorId: contractorId,
      actorRole: 'CONTRACTOR',
      action: AUDIT_ACTION.QUOTATION_SENT,
      entityType: 'Quotation',
      entityId: quotation._id,
      meta: { totalCost: costs.totalCost, requestId: String(request._id) },
    });

    return withMaterialList(quotation.toPublic());
  });
}

async function getQuotation(id, user) {
  const quotation = await Quotation.findById(id);
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  const uid = String(user.id);
  if (String(quotation.customerId) !== uid && String(quotation.contractorId) !== uid) {
    throw new ApiError(403, 'You cannot view this quotation');
  }
  return withMaterialList(quotation.toPublic());
}

async function listForRequest(requestId, user) {
  const request = await RepairRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Repair request not found');
  const uid = String(user.id);
  if (String(request.customerId) !== uid && String(request.contractorId) !== uid) {
    throw new ApiError(403, 'You cannot view these quotations');
  }
  const rows = await Quotation.find({ requestId }).sort({ createdAt: -1 });
  return Promise.all(rows.map((q) => withMaterialList(q.toPublic())));
}

function packAccept(quotation, bundle) {
  const quotationPublic = quotation.toPublic();
  return {
    ...quotationPublic,
    quotation: quotationPublic,
    order: bundle.order,
    payment: bundle.payment,
    notification: bundle.notification,
  };
}

async function customerAction(id, customerId, action, modificationNote = '') {
  const quotation = await Quotation.findById(id);
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  if (String(quotation.customerId) !== String(customerId)) {
    throw new ApiError(403, 'Only the customer can respond to this quotation');
  }

  if (action === 'accept' && quotation.status === QUOTATION_STATUS.ACCEPTED) {
    const bundle = await orderService.createDepositIntent(quotation, customerId);
    return packAccept(quotation, bundle);
  }

  if (quotation.status !== QUOTATION_STATUS.SENT) {
    throw new ApiError(409, 'This quotation is no longer awaiting a response');
  }

  const request = await RepairRequest.findById(quotation.requestId);
  const room = quotation.roomId;

  if (action === 'accept') {
    quotation.status = QUOTATION_STATUS.ACCEPTED;
    if (request) request.status = REQUEST_STATUS.ACCEPTED;
    const bundle = await runInTransaction(async (tx) => {
      await Quotation.updateMany(
        {
          requestId: quotation.requestId,
          _id: { $ne: quotation._id },
          status: QUOTATION_STATUS.SENT,
        },
        { status: QUOTATION_STATUS.REJECTED },
        postgres ? tx : undefined
      );
      await quotation.save(postgres ? tx : undefined);
      if (request) await request.save(postgres ? tx : undefined);
      await notify({
        userId: quotation.contractorId,
        title: 'Quotation accepted',
        message: request?.title || 'The customer accepted your quote',
        type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
        link: room ? `/contractor/chat/${room}` : '/contractor/requests',
        meta: { quotationId: String(quotation._id), dedupeKey: `quotation-accepted:${quotation._id}` },
      });
      await writeAudit({
        actorId: customerId,
        actorRole: 'CUSTOMER',
        action: AUDIT_ACTION.QUOTATION_ACCEPTED,
        entityType: 'Quotation',
        entityId: quotation._id,
        meta: { action, status: quotation.status },
      });
      return orderService.createDepositIntent(quotation, customerId, tx);
    });
    return packAccept(quotation, bundle);
  } else if (action === 'reject') {
    quotation.status = QUOTATION_STATUS.REJECTED;
    await notify({
      userId: quotation.contractorId,
      title: 'Quotation declined',
      message: request?.title || 'The customer declined your quote',
      type: NOTIFICATION_TYPE.QUOTATION_REJECTED,
      link: room ? `/contractor/chat/${room}` : '/contractor/requests',
      meta: { quotationId: String(quotation._id) },
    });
  } else if (action === 'modify') {
    quotation.status = QUOTATION_STATUS.MODIFICATION_REQUEST;
    quotation.modificationNote = modificationNote || 'Please revise the quote';
    await notify({
      userId: quotation.contractorId,
      title: 'Modification requested',
      message: quotation.modificationNote,
      type: NOTIFICATION_TYPE.QUOTATION_MODIFY,
      link: `/contractor/quotation/create/${quotation.requestId}`,
      meta: { quotationId: String(quotation._id) },
    });
  } else {
    throw new ApiError(400, 'Unknown quotation action');
  }

  await quotation.save();
  if (request) await request.save();
  const actionMap = {
    reject: AUDIT_ACTION.QUOTATION_REJECTED,
    modify: AUDIT_ACTION.QUOTATION_MODIFY,
  };
  await writeAudit({
    actorId: customerId,
    actorRole: 'CUSTOMER',
    action: actionMap[action],
    entityType: 'Quotation',
    entityId: quotation._id,
    meta: { action, status: quotation.status },
  });

  return quotation.toPublic();
}

module.exports = {
  createQuotation,
  getQuotation,
  listForRequest,
  customerAction,
  tally,
  lineQty,
  quoteReplayFingerprint,
  isQuoteReplay,
  REPLAY_WINDOW_MS,
};
