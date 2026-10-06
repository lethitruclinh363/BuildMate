const mongoose = require('mongoose');
const { describePlace } = require('../utils/geo');
const {
  MATERIAL_ORDER_STATUS,
  MATERIAL_PAYMENT_STATUS,
  MATERIAL_ACTOR,
  generateMaterialOrderCode,
} = require('../utils/material-order.rules');

const itemSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
    nameSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
    imageSnapshot: { type: String, default: '' },
    unitSnapshot: { type: String, default: '', trim: true },
    priceSnapshot: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: Object.values(MATERIAL_ORDER_STATUS), required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: Object.values(MATERIAL_ACTOR), required: true },
    note: { type: String, default: '', maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const materialOrderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, required: true, unique: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    storeOwnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [itemSchema],
      required: true,
      validate: [(items) => Array.isArray(items) && items.length > 0, 'Order needs at least one material'],
    },
    deliveryAddress: { type: String, required: true, trim: true, maxlength: 240 },
    deliveryLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    locationConfirmed: { type: Boolean, default: false },
    locationSource: {
      type: String,
      enum: ['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN'],
    },
    locationConfirmedAt: { type: Date, default: null },
    distanceKm: { type: Number, required: true, min: 0 },
    materialSubtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    depositRateSnapshot: { type: Number, required: true, default: 15 },
    depositAmount: { type: Number, required: true, min: 0 },
    platformFeeRateSnapshot: { type: Number, required: true, default: 5 },
    platformFeeAmount: { type: Number, required: true, min: 0 },
    storeDepositAmount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: Object.values(MATERIAL_PAYMENT_STATUS),
      default: MATERIAL_PAYMENT_STATUS.UNPAID,
    },
    status: {
      type: String,
      enum: Object.values(MATERIAL_ORDER_STATUS),
      default: MATERIAL_ORDER_STATUS.PENDING_PAYMENT,
      index: true,
    },
    statusHistory: { type: [historySchema], default: [] },
    customerNote: { type: String, trim: true, default: '', maxlength: 500 },
    remainingSettledOffline: { type: Boolean, default: false },
    remainingSettledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'materialOrders' }
);

materialOrderSchema.index({ customerId: 1, createdAt: -1 });
materialOrderSchema.index({ storeId: 1, createdAt: -1 });
materialOrderSchema.index({ deliveryLocation: '2dsphere' });

materialOrderSchema.pre('validate', function ensureCode(next) {
  if (!this.orderCode) this.orderCode = generateMaterialOrderCode();
  next();
});

materialOrderSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderCode: this.orderCode,
    customerId: this.customerId,
    storeId: this.storeId,
    storeOwnerId: this.storeOwnerId,
    items: (this.items || []).map((item) => ({
      materialId: item.materialId,
      nameSnapshot: item.nameSnapshot,
      imageSnapshot: item.imageSnapshot,
      unitSnapshot: item.unitSnapshot,
      priceSnapshot: item.priceSnapshot,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    deliveryAddress: this.deliveryAddress,
    deliveryLocation: this.deliveryLocation,
    locationConfirmed: Boolean(this.locationConfirmed),
    locationSource: this.locationSource || '',
    locationConfirmedAt: this.locationConfirmedAt || null,
    place: describePlace({ deliveryLocation: this.deliveryLocation, deliveryAddress: this.deliveryAddress }),
    distanceKm: this.distanceKm,
    materialSubtotal: this.materialSubtotal,
    shippingFee: this.shippingFee,
    totalAmount: this.totalAmount,
    depositRateSnapshot: this.depositRateSnapshot,
    depositAmount: this.depositAmount,
    platformFeeRateSnapshot: this.platformFeeRateSnapshot,
    platformFeeAmount: this.platformFeeAmount,
    storeDepositAmount: this.storeDepositAmount,
    remainingAmount: this.remainingAmount,
    paymentStatus: this.paymentStatus,
    status: this.status,
    statusHistory: this.statusHistory || [],
    customerNote: this.customerNote,
    remainingSettledOffline: Boolean(this.remainingSettledOffline),
    remainingSettledAt: this.remainingSettledAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const MaterialOrder = mongoose.model('MaterialOrder', materialOrderSchema);

module.exports = { MaterialOrder, MATERIAL_ORDER_STATUS, MATERIAL_PAYMENT_STATUS };
