const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = require('./conversation.postgres');
} else {
  module.exports = {
    RepairRequest: require('../models/RepairRequest').RepairRequest,
    ChatRoom: require('../models/ChatRoom').ChatRoom,
    Message: require('../models/Message').Message,
    Quotation: require('../models/Quotation').Quotation,
  };
}
