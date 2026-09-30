const { Order, ORDER_STATUS } = require('../models/Order');
const { ProgressUpdate, PROGRESS_STATUS } = require('../models/ProgressUpdate');
const { ApiError } = require('../utils/ApiError');
const { orderStatusAfterProgress } = require('../utils/order.rules');
const { contractorJobNotice } = require('../utils/contractor-notice');
const { notify } = require('./notification.service');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');
const { emitToUser } = require('./socket.service');
const { assertParty } = require('./order.service');

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

  const status = payload.status;
  if (!Object.values(PROGRESS_STATUS).includes(status)) {
    throw new ApiError(400, 'Invalid progress status');
  }
  const images = payload.images || [];
  if (!String(payload.description || '').trim() && !images.length) {
    throw new ApiError(400, 'Description or images are required');
  }

  const doc = {
    orderId: order._id,
    status,
    description: payload.description || '',
    images,
  };
  if (payload.lng !== undefined && payload.lat !== undefined) {
    doc.location = { type: 'Point', coordinates: [Number(payload.lng), Number(payload.lat)] };
  }

  const progress = await ProgressUpdate.create(doc);
  const previousStatus = order.status;
  const notice = contractorJobNotice(previousStatus, status);

  const next = orderStatusAfterProgress(previousStatus, status);
  if (next !== order.status) {
    order.status = next;
    await order.save();
  }

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
    meta: { orderId: String(order._id), status },
  });

  const payloadOut = { order: order.toPublic(), progress: progress.toPublic(), type: notice.type };
  emitToUser(order.customerId, notice.event, payloadOut);
  emitToUser(order.contractorId, notice.event, payloadOut);

  return { progress: progress.toPublic(), order: order.toPublic(), notification };
}

module.exports = { listProgress, addProgress };
