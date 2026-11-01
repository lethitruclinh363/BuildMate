const { ORDER_STATUS, REPAIR_JOB_STATUS } = require('../utils/order.rules');

const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

module.exports = {
  ORDER_STATUS,
  REPAIR_JOB_STATUS,
  PAYMENT_STATUS,
};
