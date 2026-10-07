
const SERVICE_CATEGORIES = Object.freeze([
  'Waterproofing',
  'Electrical',
  'Plumbing',
  'Painting',
  'Masonry',
  'Interior',
  'General repair',
]);

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const serviceSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true },
    catalogKey: { type: String, default: '' },
    catalogType: { type: String, enum: ['SYSTEM', 'CUSTOM', 'LEGACY'], default: 'LEGACY' },
    completionStatus: { type: String, enum: ['INCOMPLETE', 'COMPLETED'], default: 'COMPLETED' },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    basePrice: { type: Number, min: 0 },
    unit: {
      type: String,
      enum: ['JOB', 'HOUR', 'M2', 'DAY'],
      default: 'JOB',
    },
    estimatedHours: { type: Number, default: 4, min: 0.5, max: 240 },
    image: { type: String, default: '' },
    images: { type: [String], default: [] },
    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ storeId: 1, isActive: 1 });
serviceSchema.index({ category: 1 });
serviceSchema.index(
  { storeId: 1, catalogKey: 1 },
  { unique: true, partialFilterExpression: { catalogKey: { $gt: '' } } }
);

serviceSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    storeId: this.storeId,
    contractorId: this.contractorId,
    name: this.name,
    category: this.category,
    description: this.description,
    catalogKey: this.catalogKey || '',
    catalogType: this.catalogType || 'LEGACY',
    completionStatus: this.completionStatus || 'COMPLETED',
    basePrice: Number(this.basePrice) > 0 ? this.basePrice : null,
    unit: this.unit,
    estimatedHours: this.estimatedHours,
    image: this.image,
    images: this.images?.length ? this.images : this.image ? [this.image] : [],
    priceRange:
      Number(this.basePrice) > 0
        ? this.priceRange?.max > 0
          ? this.priceRange
          : { min: this.basePrice, max: this.basePrice }
        : null,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Service = mongoose.model('Service', serviceSchema);
  built = { Service };
  return built;
}

module.exports = {
  SERVICE_CATEGORIES,
  get Service() { return build().Service; },
};
