
const STORE_TYPE = Object.freeze({
  SERVICES: 'SERVICES',
  MATERIALS: 'MATERIALS',
  BOTH: 'BOTH',
});

const STORE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  INACTIVE: 'INACTIVE',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
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
    contactName: { type: String, trim: true, default: '', maxlength: 80 },
    contactEmail: { type: String, trim: true, default: '', maxlength: 120 },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: 'Can Tho' },
    storeType: {
      type: String,
      enum: Object.values(STORE_TYPE),
      default: STORE_TYPE.SERVICES,
    },
    coverImage: { type: String, default: '' },
    avatar: { type: String, default: '' },
    logo: { type: String, default: '' },
    gallery: { type: [String], default: [] },
    crewPhotos: { type: [String], default: [] },
    publicCertificates: { type: [String], default: [] },
    achievements: { type: String, trim: true, default: '', maxlength: 500 },
    showroomNote: { type: String, trim: true, default: '', maxlength: 500 },
    deliveryNote: { type: String, trim: true, default: '', maxlength: 500 },
    deliveryEnabled: { type: Boolean, default: false },
    baseDeliveryFee: { type: Number, default: 0, min: 0 },
    freeDeliveryRadiusKm: { type: Number, default: 0, min: 0, max: 50 },
    deliveryFeePerKm: { type: Number, default: 0, min: 0 },
    minimumOrderAmount: { type: Number, default: 0, min: 0 },
    displayYears: { type: Number, default: null, min: 0, max: 80 },
    displayWorkerCount: { type: Number, default: null, min: 0, max: 500 },
    serviceAreas: { type: [String], default: [] },
    publicSeeded: { type: Boolean, default: false },
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
      default: STORE_STATUS.INACTIVE,
    },
    // Sprint 3 nearby search
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
    locationConfirmed: { type: Boolean, default: false },
    locationSource: {
      type: String,
      enum: ['VIETMAP_PLACE', 'GPS', 'MANUAL_PIN'],
    },
    locationConfirmedAt: { type: Date, default: null },
    locationApprovedAt: { type: Date, default: null },
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
    contactName: this.contactName || '',
    contactEmail: this.contactEmail || '',
    address: this.address,
    city: this.city,
    storeType: this.storeType,
    coverImage: this.coverImage,
    avatar: this.avatar || '',
    logo: this.logo || '',
    gallery: this.gallery,
    crewPhotos: this.crewPhotos || [],
    publicCertificates: this.publicCertificates || [],
    achievements: this.achievements || '',
    showroomNote: this.showroomNote || '',
    deliveryNote: this.deliveryNote || '',
    deliveryEnabled: Boolean(this.deliveryEnabled),
    baseDeliveryFee: this.baseDeliveryFee || 0,
    freeDeliveryRadiusKm: this.freeDeliveryRadiusKm || 0,
    deliveryFeePerKm: this.deliveryFeePerKm || 0,
    minimumOrderAmount: this.minimumOrderAmount || 0,
    displayYears: this.displayYears,
    displayWorkerCount: this.displayWorkerCount,
    serviceAreas: this.serviceAreas || [],
    publicSeeded: Boolean(this.publicSeeded),
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
    lat: this.location?.coordinates?.[1] != null ? Number(this.location.coordinates[1]) : null,
    lng: this.location?.coordinates?.[0] != null ? Number(this.location.coordinates[0]) : null,
    latitude: this.location?.coordinates?.[1] != null ? Number(this.location.coordinates[1]) : null,
    longitude: this.location?.coordinates?.[0] != null ? Number(this.location.coordinates[0]) : null,
    locationConfirmed: Boolean(this.locationConfirmed),
    locationSource: this.locationSource || '',
    locationConfirmedAt: this.locationConfirmedAt || null,
    locationApprovedAt: this.locationApprovedAt || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Store = mongoose.model('Store', storeSchema);
  built = { Store };
  return built;
}

module.exports = {
  STORE_TYPE,
  STORE_STATUS,
  get Store() { return build().Store; },
};
