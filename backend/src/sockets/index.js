const { Server } = require('socket.io');
const { env } = require('../config/env');
const { setIO } = require('../services/socketService');
const { authenticateSocket, attachChatHandlers } = require('./chatSocket');

function socketOrigins() {
  return String(env.clientUrl || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: socketOrigins(),
      credentials: true,
    },
    path: '/socket.io',
  });

  setIO(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    attachChatHandlers(socket);
  });

  return io;
}

module.exports = { initSocket };
