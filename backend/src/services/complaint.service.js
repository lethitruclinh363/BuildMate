const { Order, ORDER_STATUS } = require('../models/Order');
const { Complaint, COMPLAINT_STATUS } = require('../models/Complaint');
const { ApiError } = require('../utils/ApiError');
const { notify, NOTIFICATION_TYPE } = require('./notification.service');
const { writeAudit, AUDIT_ACTION } = require('./audit.service');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function assertOrderParty(order, user) {
  const uid = String(user.id);
  if (uid === String(order.customerId) || uid === String(order.contractorId)) return;
  throw new ApiError(403, 'You are not a party on this order');
}

function assertComplaintWindow(order) {
  if (order.status === ORDER_STATUS.CUSTOMER_ACCEPTED) {
    const completedAt = order.completedAt ? new Date(order.completedAt).getTime() : 0;
    if (completedAt && Date.now() - completedAt > WEEK_MS) {
      throw new ApiError(409, 'Complaint window has closed');
    }
  }
}

async function createComplaint(user, payload) {
  const order = await Order.findById(payload.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  await assertOrderParty(order, user);
  assertComplaintWindow(order);

  if (String(payload.againstUser) === String(user.id)) {
    throw new ApiError(400, 'You cannot open a complaint against yourself');
  }

  const complaint = await Complaint.create({
    orderId: order._id,
    createdBy: user.id,
    againstUser: payload.againstUser,
    reason: payload.reason,
    description: payload.description,
    attachments: payload.attachments || [],
    status: COMPLAINT_STATUS.OPEN,
  });

  await notify({
    userId: payload.againstUser,
    title: 'New complaint',
    message: payload.reason,
    type: NOTIFICATION_TYPE.NEW_COMPLAINT,
    meta: { complaintId: String(complaint._id), orderId: String(order._id) },
  });

  await writeAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTION.COMPLAINT_CREATED,
    entityType: 'Complaint',
    entityId: complaint._id,
    meta: { orderId: String(order._id), reason: payload.reason },
  });

  return complaint.toPublic();
}

async function listMine(userId) {
  const rows = await Complaint.find({
    $or: [{ createdBy: userId }, { againstUser: userId }],
  }).sort({ createdAt: -1 });
  return rows.map((row) => row.toPublic());
}

async function listAdmin(status) {
  const filter = {};
  if (status) filter.status = status;
  const rows = await Complaint.find(filter).sort({ createdAt: -1 }).limit(200);
  return rows.map((row) => row.toPublic());
}

const COMPLAINT_TRANSITIONS = Object.freeze({
  [COMPLAINT_STATUS.OPEN]: [COMPLAINT_STATUS.PROCESSING],
  [COMPLAINT_STATUS.PROCESSING]: [COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.REJECTED],
  [COMPLAINT_STATUS.RESOLVED]: [],
  [COMPLAINT_STATUS.REJECTED]: [],
});

async function adminUpdate(id, adminId, { status, adminNote }) {
  const complaint = await Complaint.findById(id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  if (!Object.values(COMPLAINT_STATUS).includes(status)) {
    throw new ApiError(422, 'Invalid complaint status');
  }
  if (status !== complaint.status) {
    const allowed = COMPLAINT_TRANSITIONS[complaint.status] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(409, 'Invalid complaint status transition');
    }
  }
  if ((status === COMPLAINT_STATUS.RESOLVED || status === COMPLAINT_STATUS.REJECTED) && !String(adminNote || '').trim()) {
    throw new ApiError(422, 'adminNote is required to close a complaint');
  }

  complaint.status = status;
  complaint.adminNote = adminNote || complaint.adminNote;
  complaint.adminId = adminId;
  await complaint.save();

  await notify({
    userId: complaint.createdBy,
    title: 'Complaint updated',
    message: status,
    type: NOTIFICATION_TYPE.COMPLAINT_UPDATED,
    meta: { complaintId: String(complaint._id), status },
  });

  if (status === COMPLAINT_STATUS.RESOLVED) {
    await writeAudit({
      actorId: adminId,
      actorRole: 'ADMIN',
      action: AUDIT_ACTION.COMPLAINT_RESOLVED,
      entityType: 'Complaint',
      entityId: complaint._id,
      meta: { adminNote: complaint.adminNote },
    });
  }

  return complaint.toPublic();
}

module.exports = { createComplaint, listMine, listAdmin, adminUpdate };
