const { Quotation, QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../models/Quotation');
const { RepairRequest, REQUEST_STATUS } = require('../models/RepairRequest');
const { ChatRoom } = require('../models/ChatRoom');
const { ApiError } = require('../utils/ApiError');
const { sendMessage, MESSAGE_TYPE } = require('./chatService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const orderService = require('./orderService');

function tally(items = [], transportCost = 0) {
  const materialCost = items
    .filter((i) => i.type === QUOTE_ITEM_TYPE.MATERIAL)
    .reduce((sum, i) => sum + Number(i.quantity || 1) * Number(i.price || 0), 0);
  const laborCost = items
    .filter((i) => i.type === QUOTE_ITEM_TYPE.LABOR)
    .reduce((sum, i) => sum + Number(i.quantity || 1) * Number(i.price || 0), 0);
  return {
    materialCost,
    laborCost,
    transportCost: Number(transportCost) || 0,
    totalCost: materialCost + laborCost + (Number(transportCost) || 0),
  };
}

async function createQuotation(contractorId, payload) {
  const request = await RepairRequest.findById(payload.requestId);
  if (!request) throw new ApiError(404, 'Repair request not found');
  if (String(request.contractorId) !== String(contractorId)) {
    throw new ApiError(403, 'You cannot quote this request');
  }
  // ACCEPTED on the request = contractor accepted the job (or quote later).
  // Only block when a quotation was already accepted by the customer.
  if (request.status === REQUEST_STATUS.REJECTED) {
    throw new ApiError(409, 'This request was rejected');
  }
  if (request.status === REQUEST_STATUS.CANCELLED) {
    throw new ApiError(409, 'This request was cancelled');
  }
  if (request.status === REQUEST_STATUS.COMPLETED) {
    throw new ApiError(409, 'This request is already completed');
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
  if (!items.length) throw new ApiError(422, 'Add at least one line item');
  const costs = tally(items, payload.transportCost);
  const room = await ChatRoom.findOne({ requestId: request._id });

  const quotation = await Quotation.create({
    requestId: request._id,
    customerId: request.customerId,
    contractorId,
    roomId: room?._id || null,
    items,
    ...costs,
    estimatedDays: payload.estimatedDays || 1,
    note: payload.note || '',
    status: QUOTATION_STATUS.SENT,
  });

  if (room) {
    await sendMessage({
      roomId: room._id,
      senderId: contractorId,
      type: MESSAGE_TYPE.QUOTATION,
      content: `Quotation ${costs.totalCost.toLocaleString('vi-VN')}đ`,
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

  return quotation.toPublic();
}

async function getQuotation(id, user) {
  const quotation = await Quotation.findById(id);
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  const uid = String(user.id);
  if (String(quotation.customerId) !== uid && String(quotation.contractorId) !== uid) {
    throw new ApiError(403, 'You cannot view this quotation');
  }
  return quotation.toPublic();
}

async function listForRequest(requestId, user) {
  const request = await RepairRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Repair request not found');
  const uid = String(user.id);
  if (String(request.customerId) !== uid && String(request.contractorId) !== uid) {
    throw new ApiError(403, 'You cannot view these quotations');
  }
  const rows = await Quotation.find({ requestId }).sort({ createdAt: -1 });
  return rows.map((q) => q.toPublic());
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
    const request = await RepairRequest.findById(quotation.requestId);
    const bundle = await orderService.createFromQuotation(quotation, request, customerId);
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
    await Quotation.updateMany(
      {
        requestId: quotation.requestId,
        _id: { $ne: quotation._id },
        status: QUOTATION_STATUS.SENT,
      },
      { status: QUOTATION_STATUS.REJECTED }
    );
    await notify({
      userId: quotation.contractorId,
      title: 'Quotation accepted',
      message: request?.title || 'The customer accepted your quote',
      type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
      link: room ? `/contractor/chat/${room}` : '/contractor/requests',
      meta: { quotationId: String(quotation._id) },
    });
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
    accept: AUDIT_ACTION.QUOTATION_ACCEPTED,
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

  if (action === 'accept') {
    const bundle = await orderService.createFromQuotation(quotation, request, customerId);
    return packAccept(quotation, bundle);
  }

  return quotation.toPublic();
}

module.exports = { createQuotation, getQuotation, listForRequest, customerAction };
