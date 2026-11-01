const { PAYMENT_STATUS } = require('./Order');

const PAYMENT_TYPE = Object.freeze({
  FULL_PAYMENT: 'FULL_PAYMENT',
  DEPOSIT: 'DEPOSIT',
  FINAL_PAYMENT: 'FINAL_PAYMENT',
});

const PAYMENT_PROVIDER = Object.freeze({
  MOCK: 'mock',
  COD: 'cod',
  BANK_TRANSFER: 'bank_transfer',
});

module.exports = {
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_PROVIDER,
};
