const mongoose = require('mongoose');

const QUOTE_ITEM_TYPE = Object.freeze({
  MATERIAL: 'MATERIAL',
  LABOR: 'LABOR',
});

const QUOTATION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  MODIFICATION_REQUEST: 'MODIFICATION_REQUEST',
});

const quotationItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(QUOTE_ITEM_TYPE), required: true },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    quantity: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: '', trim: true },
    price: { type: Number, required: true, min: 0 },
    catalogId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RepairRequest',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      default: null,
    },
    items: { type: [quotationItemSchema], default: [] },
    materialCost: { type: Number, default: 0, min: 0 },
    laborCost: { type: Number, default: 0, min: 0 },
    transportCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    estimatedDays: { type: Number, default: 1, min: 1, max: 180 },
    note: { type: String, default: '', maxlength: 1000 },
    modificationNote: { type: String, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: Object.values(QUOTATION_STATUS),
      default: QUOTATION_STATUS.SENT,
      index: true,
    },
  },
  { timestamps: true }
);

quotationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    requestId: this.requestId,
    customerId: this.customerId,
    contractorId: this.contractorId,
    roomId: this.roomId,
    items: this.items,
    materialCost: this.materialCost,
    laborCost: this.laborCost,
    transportCost: this.transportCost,
    totalCost: this.totalCost,
    estimatedDays: this.estimatedDays,
    note: this.note,
    modificationNote: this.modificationNote,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Quotation = mongoose.model('Quotation', quotationSchema);

module.exports = { Quotation, QUOTE_ITEM_TYPE, QUOTATION_STATUS };
