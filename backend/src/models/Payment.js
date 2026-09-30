const mongoose = require('mongoose');
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

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: Object.values(PAYMENT_TYPE),
      default: PAYMENT_TYPE.FULL_PAYMENT,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
      index: true,
    },
    provider: { type: String, default: PAYMENT_PROVIDER.MOCK },
    transactionCode: { type: String, default: null, index: true, sparse: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'payments' }
);

paymentSchema.index({ orderId: 1, type: 1 }, { unique: true });
paymentSchema.index({ customerId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

paymentSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderId: this.orderId,
    customerId: this.customerId,
    contractorId: this.contractorId,
    amount: this.amount,
    type: this.type,
    status: this.status,
    provider: this.provider,
    transactionCode: this.transactionCode,
    metadata: this.metadata || {},
    paidAt: this.paidAt,
    refundedAt: this.refundedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

async function ensurePaymentIndexes() {
  try {
    const indexes = await Payment.collection.indexes();
    const legacy = indexes.find(
      (item) => item.unique && item.key && item.key.orderId === 1 && Object.keys(item.key).length === 1
    );
    if (legacy) {
      await Payment.collection.dropIndex(legacy.name);
    }
  } catch (err) {
    if (err.code !== 27 && err.codeName !== 'IndexNotFound') {
      console.warn('[payments] index migrate:', err.message);
    }
  }
}

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = {
  Payment,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_PROVIDER,
  ensurePaymentIndexes,
};
