
const COMMISSION_STATUS = Object.freeze({
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const commissionSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      unique: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rateSnapshot: { type: Number, required: true, min: 0, max: 30 },
    platformAmount: { type: Number, required: true, min: 0 },
    contractorAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(COMMISSION_STATUS),
      default: COMMISSION_STATUS.POSTED,
      index: true,
    },
  },
  { timestamps: true, collection: 'commissions' }
);

commissionSchema.index({ contractorId: 1, status: 1, createdAt: -1 });

commissionSchema.index({ contractorId: 1, createdAt: -1 });
commissionSchema.index({ status: 1, createdAt: -1 });

commissionSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    paymentId: this.paymentId,
    orderId: this.orderId,
    contractorId: this.contractorId,
    rateSnapshot: this.rateSnapshot,
    platformAmount: this.platformAmount,
    contractorAmount: this.contractorAmount,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Commission = mongoose.model('Commission', commissionSchema);
  built = { Commission };
  return built;
}

module.exports = {
  COMMISSION_STATUS,
  get Commission() { return build().Commission; },
};
