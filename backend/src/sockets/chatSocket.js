const { verifyToken, getUserId } = require('../utils/jwt');
const { User } = require('../models/User');
const chatService = require('../services/chatService');
const {
  markOnline,
  markOffline,
  emitPresence,
  emitToRoom,
} = require('../services/socketService');

async function authenticateSocket(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : null);
    if (!token) return next(new Error('Authentication required'));
    const payload = verifyToken(token);
    const userId = getUserId(payload);
    if (!payload.role || !userId) return next(new Error('Invalid token payload'));
    const user = await User.findById(userId);
    if (!user) return next(new Error('User no longer exists'));
    socket.user = { id: user._id.toString(), role: user.role, name: user.name };
    return next();
  } catch {
    return next(new Error('Invalid or expired token'));
  }
}

function attachChatHandlers(socket) {
  const userId = socket.user.id;
  socket.join(`user:${userId}`);
  markOnline(userId, socket.id);
  emitPresence(userId, true);

  socket.on('join:user', () => {
    socket.join(`user:${userId}`);
  });

  socket.on('join_room', async (payload, ack) => {
    try {
      const roomId = payload?.roomId || payload;
      const room = await chatService.assertMember(roomId, userId);
      socket.join(`room:${room._id}`);
      if (typeof ack === 'function') ack({ ok: true, roomId: String(room._id) });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, message: err.message });
    }
  });

  socket.on('send_message', async (payload, ack) => {
    try {
      const data = await chatService.sendMessage({
        roomId: payload.roomId,
        senderId: userId,
        type: payload.type,
        content: payload.content,
        quotationId: payload.quotationId,
        location: payload.location,
      });
      if (typeof ack === 'function') ack({ ok: true, data });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, message: err.message });
    }
  });

  socket.on('typing', (payload) => {
    const roomId = payload?.roomId;
    if (!roomId) return;
    emitToRoom(roomId, 'typing', {
      roomId: String(roomId),
      userId,
      name: socket.user.name,
      isTyping: Boolean(payload?.isTyping),
    });
  });

  socket.on('disconnect', () => {
    const wentOffline = markOffline(userId, socket.id);
    if (wentOffline) emitPresence(userId, false);
  });
}

module.exports = { authenticateSocket, attachChatHandlers };
