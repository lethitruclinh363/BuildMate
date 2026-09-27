const mongoose = require('mongoose');

const STORE_TYPE = Object.freeze({
  SERVICES: 'SERVICES',
  MATERIALS: 'MATERIALS',
  BOTH: 'BOTH',
});

const STORE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
});

const storeSchema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slogan: { type: String, trim: true, default: '', maxlength: 140 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    phone: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: 'Can Tho' },
    storeType: {
      type: String,
      enum: Object.values(STORE_TYPE),
      default: STORE_TYPE.SERVICES,
    },
    coverImage: { type: String, default: '' },
    gallery: { type: [String], default: [] },
    openingHours: { type: String, default: '07:00 – 18:00' },
    serviceRadiusKm: { type: Number, default: 5, min: 1, max: 50 },
    category: { type: String, trim: true, default: 'General repair' },
    verified: { type: Boolean, default: false },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    materialRating: { type: Number, default: 0, min: 0, max: 5 },
    materialReviewCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(STORE_STATUS),
      default: STORE_STATUS.LIVE,
    },
    // Sprint 3 nearby search
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [105.787, 10.045] },
    },
  },
  { timestamps: true }
);

storeSchema.index({ location: '2dsphere' });
storeSchema.index({ status: 1, storeType: 1 });

storeSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    contractorId: this.contractorId,
    name: this.name,
    slogan: this.slogan,
    description: this.description,
    phone: this.phone,
    address: this.address,
    city: this.city,
    storeType: this.storeType,
    coverImage: this.coverImage,
    gallery: this.gallery,
    openingHours: this.openingHours,
    serviceRadiusKm: this.serviceRadiusKm,
    category: this.category,
    verified: this.verified,
    rating: this.rating,
    reviewCount: this.reviewCount,
    materialRating: this.materialRating,
    materialReviewCount: this.materialReviewCount,
    status: this.status,
    location: this.location,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Store = mongoose.model('Store', storeSchema);

module.exports = { Store, STORE_TYPE, STORE_STATUS };
