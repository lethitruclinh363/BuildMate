const { ORDER_STATUS } = require('../models/Order');
const { PROGRESS_STATUS } = require('../models/ProgressUpdate');
const { Order, ProgressUpdate, runInTransaction } = require('../repositories/commerceAccess');
const { ApiError } = require('../utils/ApiError');
const { isValidProgressTransition, orderStatusAfterProgress } = require('../utils/order.rules');
const { contractorJobNotice } = require('../utils/contractor-notice');
const { notify } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');
const { emitToUser } = require('./socketService');
const { assertParty } = require('./orderService');

async function listProgress(orderId, user) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  await assertParty(order, user);
  const rows = await ProgressUpdate.find({ orderId: order._id }).sort({ createdAt: 1 });
  return rows.map((row) => row.toPublic());
}

async function addProgress(orderId, user, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if ([ORDER_STATUS.CUSTOMER_ACCEPTED, ORDER_STATUS.CANCELLED].includes(order.status)) {
    throw new ApiError(409, 'Order is closed');
  }

  if (user.role !== 'CONTRACTOR' || String(order.contractorId) !== String(user.id)) {
    throw new ApiError(403, 'You cannot update progress on this order');
  }

  const nextStatus = payload.status;
  if (!Object.values(PROGRESS_STATUS).includes(nextStatus)) {
    throw new ApiError(400, 'Invalid progress status');
  }
  const images = payload.images || [];
  if (!String(payload.description || '').trim() && !images.length) {
    throw new ApiError(400, 'Description or images are required');
  }
  if (!isValidProgressTransition(order.status, nextStatus)) {
    throw new ApiError(409, 'Invalid progress transition');
  }

  const doc = {
    orderId: order._id,
    status: nextStatus,
    description: payload.description || '',
    images,
    actorId: user.id,
  };
  if (payload.lng !== undefined && payload.lat !== undefined) {
    doc.location = { type: 'Point', coordinates: [Number(payload.lng), Number(payload.lat)] };
  }

  const previousStatus = order.status;
  const notice = contractorJobNotice(previousStatus, nextStatus);
  const next = orderStatusAfterProgress(previousStatus, nextStatus);
  const progress = await runInTransaction(async (tx) => {
    const created = await ProgressUpdate.create(doc, tx);
    if (next !== order.status) {
      order.status = next;
      await order.save(tx);
    }
    return created;
  });

  const notification = await notify({
    userId: order.customerId,
    title: notice.title,
    message: `${order.title}`,
    type: notice.type,
    link: `/customer/orders/${order._id}`,
    meta: { orderId: String(order._id), progressId: String(progress._id) },
  });

  await writeAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTION.PROGRESS_UPDATED,
    entityType: 'ProgressUpdate',
    entityId: progress._id,
    meta: { orderId: String(order._id), status: nextStatus },
  });

  const payloadOut = { order: order.toPublic(), progress: progress.toPublic(), type: notice.type };
  emitToUser(order.customerId, notice.event, payloadOut);
  emitToUser(order.contractorId, notice.event, payloadOut);

  return { progress: progress.toPublic(), order: order.toPublic(), notification };
}

module.exports = { listProgress, addProgress };
