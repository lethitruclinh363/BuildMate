let io = null;
const onlineUsers = new Map();

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

function markOnline(userId, socketId) {
  const id = String(userId);
  const set = onlineUsers.get(id) || new Set();
  set.add(socketId);
  onlineUsers.set(id, set);
}

function markOffline(userId, socketId) {
  const id = String(userId);
  const set = onlineUsers.get(id);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(id);
    return true;
  }
  return false;
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

function emitToRoom(roomId, event, payload) {
  if (!io || !roomId) return;
  io.to(`room:${roomId}`).emit(event, payload);
}

function emitPresence(userId, online) {
  if (!io) return;
  io.emit('user_online', { userId: String(userId), online });
}

module.exports = {
  setIO,
  getIO,
  markOnline,
  markOffline,
  isOnline,
  emitToUser,
  emitToRoom,
  emitPresence,
};
