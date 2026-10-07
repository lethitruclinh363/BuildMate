const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = require('./materialOrder.postgres');
} else {
  module.exports = {
    MaterialOrder: require('../models/MaterialOrder').MaterialOrder,
    MaterialOrderPayment: require('../models/MaterialOrderPayment').MaterialOrderPayment,
    MaterialCommission: require('../models/MaterialCommission').MaterialCommission,
  };
}
