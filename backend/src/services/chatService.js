const { ChatRoom } = require('../models/ChatRoom');
const { Message, MESSAGE_TYPE } = require('../models/Message');
const { User } = require('../models/User');
const { RepairRequest } = require('../models/RepairRequest');
const { Quotation } = require('../models/Quotation');
const { ApiError } = require('../utils/ApiError');
const { emitToRoom, isOnline } = require('./socketService');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');

function preview(type, content) {
  if (type === MESSAGE_TYPE.IMAGE) return 'Sent a photo';
  if (type === MESSAGE_TYPE.VIDEO) return 'Sent a video';
  if (type === MESSAGE_TYPE.QUOTATION) return 'Sent a quotation';
  return String(content || '').slice(0, 140);
}

async function assertMember(roomId, userId) {
  const room = await ChatRoom.findById(roomId);
  if (!room) throw new ApiError(404, 'Chat room not found');
  const uid = String(userId);
  if (String(room.customerId) !== uid && String(room.contractorId) !== uid) {
    throw new ApiError(403, 'You are not in this conversation');
  }
  return room;
}

async function createRoomForRequest(request) {
  return ChatRoom.findOneAndUpdate(
    { requestId: request._id },
    {
      customerId: request.customerId,
      contractorId: request.contractorId,
      requestId: request._id,
      lastMessage: 'Repair request opened',
      lastMessageAt: new Date(),
    },
    { upsert: true, new: true }
  );
}

async function listRooms(userId, role) {
  const filter = role === 'CONTRACTOR' ? { contractorId: userId } : { customerId: userId };
  const rooms = await ChatRoom.find(filter).sort({ lastMessageAt: -1 }).limit(50);
  const [users, requests] = await Promise.all([
    User.find({ _id: { $in: rooms.flatMap((r) => [r.customerId, r.contractorId]) } }),
    RepairRequest.find({ _id: { $in: rooms.map((r) => r.requestId) } }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u.toPublic()]));
  const reqMap = Object.fromEntries(requests.map((r) => [String(r._id), r.toPublic()]));
  return rooms.map((room) => {
    const otherId =
      String(room.customerId) === String(userId) ? room.contractorId : room.customerId;
    return {
      ...room.toPublic(),
      otherUser: userMap[String(otherId)] || null,
      request: reqMap[String(room.requestId)] || null,
      otherOnline: isOnline(otherId),
    };
  });
}

async function getRoom(roomId, userId) {
  const room = await assertMember(roomId, userId);
  const [customer, contractor, request] = await Promise.all([
    User.findById(room.customerId),
    User.findById(room.contractorId),
    RepairRequest.findById(room.requestId),
  ]);
  return {
    ...room.toPublic(),
    customer: customer ? customer.toPublic() : null,
    contractor: contractor ? contractor.toPublic() : null,
    request: request ? request.toPublic() : null,
    customerOnline: isOnline(room.customerId),
    contractorOnline: isOnline(room.contractorId),
  };
}

async function listMessages(roomId, userId, { before, limit = 50 } = {}) {
  await assertMember(roomId, userId);
  const filter = { roomId };
  if (before) filter.createdAt = { $lt: new Date(before) };
  const rows = await Message.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 100));
  const quotes = await Quotation.find({
    _id: { $in: rows.filter((m) => m.quotationId).map((m) => m.quotationId) },
  });
  const quoteMap = Object.fromEntries(quotes.map((q) => [String(q._id), q.toPublic()]));
  return rows
    .reverse()
    .map((m) => ({
      ...m.toPublic(),
      quotation: m.quotationId ? quoteMap[String(m.quotationId)] || null : null,
    }));
}

async function sendMessage({ roomId, senderId, type = MESSAGE_TYPE.TEXT, content = '', quotationId = null }) {
  const room = await assertMember(roomId, senderId);
  const message = await Message.create({
    roomId: room._id,
    senderId,
    type,
    content,
    quotationId,
  });
  room.lastMessage = preview(type, content);
  room.lastMessageAt = new Date();
  await room.save();

  let quotation = null;
  if (quotationId) {
    const q = await Quotation.findById(quotationId);
    quotation = q ? q.toPublic() : null;
  }

  const payload = { ...message.toPublic(), quotation };
  emitToRoom(room._id, 'receive_message', payload);

  const otherId =
    String(room.customerId) === String(senderId) ? room.contractorId : room.customerId;
  const sender = await User.findById(senderId);
  const chatLink =
    String(room.customerId) === String(otherId)
      ? `/customer/chat/${room._id}`
      : `/contractor/chat/${room._id}`;

  if (type !== MESSAGE_TYPE.QUOTATION) {
    await notify({
      userId: otherId,
      title: sender?.name || 'New message',
      message: preview(type, content),
      type: NOTIFICATION_TYPE.MESSAGE,
      link: chatLink,
      meta: { roomId: String(room._id) },
    });
  }

  return payload;
}

module.exports = {
  assertMember,
  createRoomForRequest,
  listRooms,
  getRoom,
  listMessages,
  sendMessage,
  MESSAGE_TYPE,
};
