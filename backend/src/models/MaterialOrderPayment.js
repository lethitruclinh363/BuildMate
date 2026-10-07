const { MATERIAL_PAYMENT_STATUS } = require('../utils/material-order.rules');

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const materialOrderPaymentSchema = new mongoose.Schema(
  {
    materialOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialOrder',
      required: true,
      unique: true,
      index: true,
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    platformFeeAmount: { type: Number, required: true, min: 0 },
    storeDepositAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(MATERIAL_PAYMENT_STATUS),
      default: MATERIAL_PAYMENT_STATUS.UNPAID,
      index: true,
    },
    provider: { type: String, default: 'mock' },
    transactionCode: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'materialOrderPayments' }
);

materialOrderPaymentSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    materialOrderId: this.materialOrderId,
    customerId: this.customerId,
    storeOwnerId: this.storeOwnerId,
    amount: this.amount,
    platformFeeAmount: this.platformFeeAmount,
    storeDepositAmount: this.storeDepositAmount,
    status: this.status,
    provider: this.provider,
    transactionCode: this.transactionCode,
    paidAt: this.paidAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const MaterialOrderPayment = mongoose.model('MaterialOrderPayment', materialOrderPaymentSchema);
  built = { MaterialOrderPayment };
  return built;
}

module.exports = {
  get MaterialOrderPayment() { return build().MaterialOrderPayment; },
};
