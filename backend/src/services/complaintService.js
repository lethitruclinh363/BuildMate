const { ORDER_STATUS } = require('../models/Order');
const { COMPLAINT_STATUS } = require('../models/Complaint');
const { Order, Complaint } = require('../repositories/commerceAccess');
const { loadUser, findUsersByRole } = require('../repositories/partnerAccess');
const { ApiError } = require('../utils/ApiError');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const { writeAudit, AUDIT_ACTION } = require('./auditService');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const complaintLocks = new Map();

const COMPLAINT_TRANSITIONS = Object.freeze({
  [COMPLAINT_STATUS.OPEN]: [COMPLAINT_STATUS.PROCESSING],
  [COMPLAINT_STATUS.PROCESSING]: [COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.REJECTED],
  [COMPLAINT_STATUS.RESOLVED]: [],
  [COMPLAINT_STATUS.REJECTED]: [],
});

function withComplaintLock(id, work) {
  const key = String(id);
  const previous = complaintLocks.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  const tracked = next.finally(() => {
    if (complaintLocks.get(key) === tracked) complaintLocks.delete(key);
  });
  complaintLocks.set(key, tracked);
  return tracked;
}

async function assertOrderParty(order, user) {
  const uid = String(user.id);
  if (uid === String(order.customerId) || uid === String(order.contractorId)) return;
  throw new ApiError(403, 'You are not a party on this order');
}

function otherPartyId(order, userId) {
  const uid = String(userId);
  return uid === String(order.customerId) ? String(order.contractorId) : String(order.customerId);
}

function partyComplaintLink(role, orderId) {
  if (role === 'CONTRACTOR') return `/contractor/orders/${orderId}`;
  return '/customer/complaints';
}

function assertComplaintWindow(order) {
  if (order.status === ORDER_STATUS.CUSTOMER_ACCEPTED) {
    const completedAt = order.completedAt ? new Date(order.completedAt).getTime() : 0;
    if (completedAt && Date.now() - completedAt > WEEK_MS) {
      throw new ApiError(409, 'Complaint window has closed');
    }
  }
}

async function notifyComplaintOpened(complaint, order) {
  const against = await loadUser(complaint.againstUser);
  await notify({
    userId: complaint.againstUser,
    title: 'New complaint',
    message: complaint.reason,
    type: NOTIFICATION_TYPE.NEW_COMPLAINT,
    link: partyComplaintLink(against?.role, order._id),
    meta: { complaintId: String(complaint._id), orderId: String(order._id) },
  });
  const admins = await findUsersByRole('ADMIN');
  await Promise.all(
    (admins || []).map((admin) =>
      notify({
        userId: admin._id,
        title: 'New complaint',
        message: complaint.reason,
        type: NOTIFICATION_TYPE.NEW_COMPLAINT,
        link: `/complaints/${complaint._id}`,
        meta: { complaintId: String(complaint._id), orderId: String(order._id) },
      })
    )
  );
}

async function notifyComplaintUpdated(complaint) {
  const [created, against] = await Promise.all([
    loadUser(complaint.createdBy),
    loadUser(complaint.againstUser),
  ]);
  const recipients = [
    { userId: complaint.createdBy, role: created?.role },
    { userId: complaint.againstUser, role: against?.role },
  ];
  const seen = new Set();
  await Promise.all(
    recipients
      .filter((row) => {
        const key = String(row.userId);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row) =>
        notify({
          userId: row.userId,
          title: 'Complaint updated',
          message: complaint.status,
          type: NOTIFICATION_TYPE.COMPLAINT_UPDATED,
          link: partyComplaintLink(row.role, complaint.orderId),
          meta: { complaintId: String(complaint._id), status: complaint.status, orderId: String(complaint.orderId) },
        })
      )
  );
}

async function createComplaint(user, payload) {
  const order = await Order.findById(payload.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  await assertOrderParty(order, user);
  assertComplaintWindow(order);

  if (String(payload.againstUser) === String(user.id)) {
    throw new ApiError(400, 'You cannot open a complaint against yourself');
  }
  if (String(payload.againstUser) !== otherPartyId(order, user.id)) {
    throw new ApiError(403, 'You can only open a complaint against the other party');
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

  await notifyComplaintOpened(complaint, order);

  await writeAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTION.COMPLAINT_CREATED,
    entityType: 'Complaint',
    entityId: complaint._id,
    meta: { orderId: String(order._id), reason: payload.reason },
  });

  const escrowService = require('./escrowService');
  await escrowService.freezeIfComplaint(order._id);

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

async function adminUpdate(id, adminId, { status, adminNote }) {
  return withComplaintLock(id, async () => {
    const complaint = await Complaint.findById(id);
    if (!complaint) throw new ApiError(404, 'Complaint not found');
    if (!Object.values(COMPLAINT_STATUS).includes(status)) {
      throw new ApiError(422, 'Invalid complaint status');
    }
    const nextNote = String(adminNote || '').trim() || complaint.adminNote;
    if (status === complaint.status && String(nextNote || '') === String(complaint.adminNote || '')) {
      return complaint.toPublic();
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

    const statusChanged = status !== complaint.status;
    complaint.status = status;
    complaint.adminNote = adminNote || complaint.adminNote;
    complaint.adminId = adminId;
    await complaint.save();

    if (statusChanged) {
      await notifyComplaintUpdated(complaint);
    }

    if (status === COMPLAINT_STATUS.RESOLVED && statusChanged) {
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
  });
}

module.exports = {
  createComplaint,
  listMine,
  listAdmin,
  adminUpdate,
  COMPLAINT_TRANSITIONS,
  otherPartyId,
};
