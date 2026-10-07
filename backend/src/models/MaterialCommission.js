
const MATERIAL_COMMISSION_STATUS = Object.freeze({
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const materialCommissionSchema = new mongoose.Schema(
  {
    materialOrderPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialOrderPayment',
      required: true,
      unique: true,
    },
    materialOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaterialOrder',
      required: true,
      index: true,
    },
    storeOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rateSnapshot: { type: Number, required: true, min: 0, max: 30 },
    platformAmount: { type: Number, required: true, min: 0 },
    storeAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(MATERIAL_COMMISSION_STATUS),
      default: MATERIAL_COMMISSION_STATUS.POSTED,
    },
  },
  { timestamps: true, collection: 'materialCommissions' }
);

materialCommissionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    materialOrderPaymentId: this.materialOrderPaymentId,
    materialOrderId: this.materialOrderId,
    storeOwnerId: this.storeOwnerId,
    rateSnapshot: this.rateSnapshot,
    platformAmount: this.platformAmount,
    storeAmount: this.storeAmount,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const MaterialCommission = mongoose.model('MaterialCommission', materialCommissionSchema);
  built = { MaterialCommission };
  return built;
}

module.exports = {
  MATERIAL_COMMISSION_STATUS,
  get MaterialCommission() { return build().MaterialCommission; },
};
