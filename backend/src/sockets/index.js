const { Server } = require('socket.io');
const { env } = require('../config/env');
const { setIO } = require('../services/socket.service');
const { authenticateSocket, attachChatHandlers } = require('./chat.socket');

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientUrl,
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
