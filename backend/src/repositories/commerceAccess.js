const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = { ...require('./commerce.postgres'), postgres: true };
} else {
  const Payment = require('../models/Payment').Payment;
  Payment.listByOrder = async function listByOrder(orderId) {
    return this.find({ orderId });
  };
  module.exports = {
    Order: require('../models/Order').Order,
    Payment,
    CommissionRule: require('../models/CommissionRule').CommissionRule,
    Commission: require('../models/Commission').Commission,
    ProgressUpdate: require('../models/ProgressUpdate').ProgressUpdate,
    Review: require('../models/Review').Review,
    Complaint: require('../models/Complaint').Complaint,
    postgres: false,
    async runInTransaction(work) {
      return work(undefined);
    },
  };
}
