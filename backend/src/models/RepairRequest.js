const mongoose = require('mongoose');
const { describePlace } = require('../utils/geo');

const REPAIR_CATEGORY = Object.freeze({
  PLUMBING: 'PLUMBING',
  ELECTRIC: 'ELECTRIC',
  PAINTING: 'PAINTING',
  WATERPROOF: 'WATERPROOF',
  TILE: 'TILE',
});

const REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

const repairRequestSchema = new mongoose.Schema(
  {
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
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    serviceName: { type: String, trim: true, default: '', maxlength: 80 },
    catalogServiceId: { type: String, trim: true, default: '', maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    images: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    address: { type: String, trim: true, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [105.746, 10.045] },
    },
    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.PENDING,
      index: true,
    },
  },
  { timestamps: true }
);

repairRequestSchema.index({ location: '2dsphere' });
repairRequestSchema.index({ customerId: 1, createdAt: -1 });
repairRequestSchema.index({ contractorId: 1, createdAt: -1 });

repairRequestSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    customerId: this.customerId,
    contractorId: this.contractorId,
    storeId: this.storeId,
    category: this.category,
    serviceName: this.serviceName || '',
    catalogServiceId: this.catalogServiceId || '',
    title: this.title,
    description: this.description,
    images: this.images,
    videos: this.videos,
    address: this.address,
    location: this.location,
    place: describePlace({ location: this.location, address: this.address }),
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const RepairRequest = mongoose.model('RepairRequest', repairRequestSchema);

module.exports = { RepairRequest, REPAIR_CATEGORY, REQUEST_STATUS };
