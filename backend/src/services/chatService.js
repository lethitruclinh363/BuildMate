const { MESSAGE_TYPE } = require('../models/Message');
const { ChatRoom, Message, RepairRequest, Quotation } = require('../repositories/conversationAccess');
const { loadUser, findUsersByIds, Store } = require('../repositories/partnerAccess');
const { ApiError } = require('../utils/ApiError');
const { sanitizeChatLocation } = require('../utils/chat-location');
const { emitToRoom, emitToUser, isOnline } = require('./socketService');
const { withMaterialList } = require('../utils/quotation-materials');
const { parseMrlChat } = require('../utils/mrl-chat');
const { notify, NOTIFICATION_TYPE } = require('./notificationService');
const {
  ROOM_KIND,
  isStoreChat,
  canCreateStoreRoom,
  canSendInStoreRoom,
  quotationAllowed,
  chatPathForRole,
} = require('../utils/chat-room.rules');

const PARTNER_ROLES = new Set(['CONTRACTOR', 'MATERIAL_STORE_OWNER', 'STORE']);

function preview(type, content, location) {
  if (type === MESSAGE_TYPE.IMAGE) return 'Sent a photo';
  if (type === MESSAGE_TYPE.VIDEO) return 'Sent a video';
  if (type === MESSAGE_TYPE.QUOTATION) return 'Sent a quotation';
  if (type === MESSAGE_TYPE.LOCATION) return location?.label || location?.address || 'Shared a location';
  const raw = String(content || '');
  if (raw.startsWith('[[BM:MRL]]')) {
    return raw.split('\n')[0].replace('[[BM:MRL]]', '').trim().slice(0, 140) || 'Material list';
  }
  return raw.slice(0, 140);
}

function chatPathFor(user, roomId) {
  return chatPathForRole(user?.role, roomId);
}

function roomKindOf(room) {
  return room.roomKind || (room.storeId ? ROOM_KIND.CUSTOMER_MATERIAL_STORE : ROOM_KIND.CUSTOMER_CONTRACTOR);
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
      roomKind: ROOM_KIND.CUSTOMER_CONTRACTOR,
      lastMessage: 'Repair request opened',
      lastMessageAt: new Date(),
    },
    { upsert: true, new: true }
  );
}

async function createRoomForStore(user, storeId) {
  if (user.role !== 'CUSTOMER') {
    throw new ApiError(403, 'Only customers can start a store chat');
  }
  const store = await Store.findById(storeId);
  if (!store) throw new ApiError(404, 'Store not found');
  const existing = await ChatRoom.findOne({
    customerId: user.id,
    storeId: store._id,
    roomKind: ROOM_KIND.CUSTOMER_MATERIAL_STORE,
  });
  if (existing) return getRoom(existing._id, user.id);

  const owner = await loadUser(store.contractorId);
  if (!canCreateStoreRoom({
    status: store.status,
    storeType: store.storeType,
    ownerBlocked: owner?.status === 'BLOCKED' || owner?.status === 'BANNED',
  })) {
    throw new ApiError(409, 'This store is not available for chat');
  }

  const created = await ChatRoom.create({
    customerId: user.id,
    contractorId: store.contractorId,
    storeId: store._id,
    roomKind: ROOM_KIND.CUSTOMER_MATERIAL_STORE,
    lastMessage: '',
    lastMessageAt: new Date(),
  });
  return getRoom(created._id, user.id);
}

function storePeer(room, userMap, userId) {
  const otherId = String(room.customerId) === String(userId) ? room.contractorId : room.customerId;
  if (isStoreChat(roomKindOf(room)) && String(room.customerId) === String(userId)) {
    return {
      id: String(otherId),
      name: room.storeName || userMap[String(otherId)]?.name || 'Material store',
      avatar: room.storeAvatar || userMap[String(otherId)]?.avatar || '',
    };
  }
  return userMap[String(otherId)] || null;
}

async function listRooms(userId, role) {
  let filter = { customerId: userId };
  if (role === 'CONTRACTOR') {
    filter = { contractorId: userId, roomKind: ROOM_KIND.CUSTOMER_CONTRACTOR };
  } else if (role === 'MATERIAL_STORE_OWNER' || role === 'STORE') {
    filter = { contractorId: userId, roomKind: ROOM_KIND.CUSTOMER_MATERIAL_STORE };
  } else if (PARTNER_ROLES.has(role)) {
    filter = { contractorId: userId };
  }
  const rooms = await ChatRoom.find(filter).sort({ lastMessageAt: -1 }).limit(50);
  const [users, requests] = await Promise.all([
    findUsersByIds(rooms.flatMap((room) => [room.customerId, room.contractorId])),
    RepairRequest.find({ _id: { $in: rooms.map((r) => r.requestId).filter(Boolean) } }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u.toPublic()]));
  const reqMap = Object.fromEntries(requests.map((r) => [String(r._id), r.toPublic()]));
  return rooms.map((room) => {
    const otherId =
      String(room.customerId) === String(userId) ? room.contractorId : room.customerId;
    return {
      ...room.toPublic(),
      otherUser: storePeer(room, userMap, userId),
      request: reqMap[String(room.requestId)] || null,
      otherOnline: isOnline(otherId),
    };
  });
}

async function getRoom(roomId, userId) {
  const room = await assertMember(roomId, userId);
  const [customer, contractor, request] = await Promise.all([
    loadUser(room.customerId),
    loadUser(room.contractorId),
    room.requestId ? RepairRequest.findById(room.requestId) : null,
  ]);
  const kind = roomKindOf(room);
  const contractorPublic = contractor ? contractor.toPublic() : null;
  const storeContractor = isStoreChat(kind)
    ? {
        id: contractorPublic?.id || String(room.contractorId),
        name: room.storeName || contractorPublic?.name || 'Material store',
        avatar: room.storeAvatar || contractorPublic?.avatar || '',
      }
    : contractorPublic;
  return {
    ...room.toPublic(),
    customer: customer ? customer.toPublic() : null,
    contractor: storeContractor,
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
  const decorated = await Promise.all(quotes.map((q) => withMaterialList(q.toPublic())));
  const quoteMap = Object.fromEntries(
    decorated.filter(Boolean).map((q) => [String(q.id), q])
  );
  return rows
    .reverse()
    .map((m) => ({
      ...m.toPublic(),
      roomId: String(m.roomId || roomId),
      quotation: m.quotationId ? quoteMap[String(m.quotationId)] || null : null,
    }));
}

function requireChatMediaContent(type, content) {
  if (type !== MESSAGE_TYPE.IMAGE && type !== MESSAGE_TYPE.VIDEO) return;
  const value = String(content || '').trim();
  if (!value) throw new ApiError(422, 'Media cannot be empty');
  if (!value.startsWith('/uploads/chat/')) {
    throw new ApiError(422, 'Chat media must be uploaded through BuildMate');
  }
}

async function sendMessage({ roomId, senderId, type = MESSAGE_TYPE.TEXT, content = '', quotationId = null, location = null }) {
  const room = await assertMember(roomId, senderId);
  const kind = roomKindOf(room);
  if (!quotationAllowed(kind) && (type === MESSAGE_TYPE.QUOTATION || quotationId)) {
    throw new ApiError(409, 'Repair quotations cannot be sent in a store chat');
  }
  const [senderUser, otherUser] = await Promise.all([
    loadUser(senderId),
    loadUser(String(room.customerId) === String(senderId) ? room.contractorId : room.customerId),
  ]);
  if (isStoreChat(kind) && (
    !canSendInStoreRoom({ accountStatus: senderUser?.status, storeStatus: room.storeStatus })
    || !canSendInStoreRoom({ accountStatus: otherUser?.status, storeStatus: room.storeStatus })
  )) {
    throw new ApiError(403, 'This conversation is read-only');
  }
  requireChatMediaContent(type, content);
  const shared = type === MESSAGE_TYPE.LOCATION ? sanitizeChatLocation(location) : null;
  if (type === MESSAGE_TYPE.LOCATION && !shared) {
    throw new ApiError(422, 'Coordinates are invalid');
  }
  const message = await Message.create({
    roomId: room._id,
    senderId,
    type,
    content: shared ? shared.label || shared.address : content,
    quotationId,
    ...(shared ? { location: shared } : {}),
  });
  room.lastMessage = preview(type, content, shared);
  room.lastMessageAt = new Date();
  await room.save();

  let quotation = null;
  if (quotationId) {
    const q = await Quotation.findById(quotationId);
    quotation = q ? await withMaterialList(q.toPublic()) : null;
  }

  const payload = {
    ...message.toPublic(),
    quotation,
    id: String(message._id || message.id),
    roomId: String(room._id),
  };
  emitToRoom(String(room._id), 'receive_message', payload);
  emitToUser(String(room.customerId), 'receive_message', payload);
  emitToUser(String(room.contractorId), 'receive_message', payload);
  if (quotation) {
    emitToUser(String(room.customerId), 'quotation:new', quotation);
    emitToUser(String(room.contractorId), 'quotation:new', quotation);
  }

  const otherId =
    String(room.customerId) === String(senderId) ? room.contractorId : room.customerId;
  const chatLink = chatPathFor(otherUser, room._id);

  if (type !== MESSAGE_TYPE.QUOTATION && !parseMrlChat(content)) {
    await notify({
      userId: otherId,
      title: senderUser?.name || 'New message',
      message: preview(type, content, shared),
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
  createRoomForStore,
  listRooms,
  getRoom,
  listMessages,
  sendMessage,
  MESSAGE_TYPE,
};
