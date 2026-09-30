const mongoose = require('mongoose');
const { ORDER_STATUS, REPAIR_JOB_STATUS, generateOrderCode } = require('../utils/order.rules');

const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      required: true,
      unique: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RepairRequest',
      required: true,
      unique: true,
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
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [105.746, 10.045] },
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.QUOTATION_ACCEPTED,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    cancelReason: { type: String, default: '', maxlength: 500 },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'orders' }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ contractorId: 1, status: 1, updatedAt: -1 });
orderSchema.index({ location: '2dsphere' });

orderSchema.pre('validate', function ensureCode(next) {
  if (!this.orderCode) this.orderCode = generateOrderCode();
  next();
});

orderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderCode: this.orderCode,
    quotationId: this.quotationId,
    requestId: this.requestId,
    customerId: this.customerId,
    contractorId: this.contractorId,
    storeId: this.storeId,
    title: this.title,
    description: this.description,
    location: this.location,
    amount: this.amount,
    status: this.status,
    paymentStatus: this.paymentStatus,
    cancelReason: this.cancelReason,
    cancelledAt: this.cancelledAt,
    completedAt: this.completedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Order = mongoose.model('Order', orderSchema);

module.exports = { Order, ORDER_STATUS, REPAIR_JOB_STATUS, PAYMENT_STATUS };
