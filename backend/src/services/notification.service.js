const { Notification, NOTIFICATION_TYPE } = require('../models/Notification');
const { emitToUser } = require('./socket.service');

async function notify({ userId, title, message, type, link = '', meta = {} }) {
  const doc = await Notification.create({
    userId,
    title,
    message,
    type,
    link,
    meta,
  });
  const payload = doc.toPublic();
  emitToUser(userId, 'notification:new', payload);
  return payload;
}

async function listForUser(userId, { unreadOnly, page = 1, limit = 40 } = {}) {
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;
  const skip = (Math.max(Number(page) || 1, 1) - 1) * Math.min(Number(limit) || 40, 80);
  const take = Math.min(Number(limit) || 40, 80);
  const [rows, unread, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(take),
    Notification.countDocuments({ userId, isRead: false }),
    Notification.countDocuments(filter),
  ]);
  return { items: rows.map((n) => n.toPublic()), unread, total, page: Number(page) || 1 };
}

async function markRead(userId, id) {
  const doc = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { isRead: true },
    { new: true }
  );
  return doc ? doc.toPublic() : null;
}

async function markAllRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  return { ok: true };
}

module.exports = {
  notify,
  listForUser,
  markRead,
  markAllRead,
  NOTIFICATION_TYPE,
};
