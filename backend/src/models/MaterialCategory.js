
const CATEGORY_RECORD_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const materialCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    normalizedName: { type: String, required: true },
    foldedName: { type: String, required: true },
    type: { type: String, enum: ['CUSTOM', 'SYSTEM'], default: 'CUSTOM' },
    status: {
      type: String,
      enum: Object.values(CATEGORY_RECORD_STATUS),
      default: CATEGORY_RECORD_STATUS.APPROVED,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      required() {
        return this.type !== 'SYSTEM';
      },
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      default: null,
    },
  },
  { timestamps: true }
);

materialCategorySchema.index({ ownerId: 1, normalizedName: 1 }, { unique: true });
materialCategorySchema.index({ ownerId: 1, foldedName: 1 }, { unique: true });
materialCategorySchema.index({ foldedName: 1 }, { unique: true, partialFilterExpression: { type: 'SYSTEM' } });

const MaterialCategory = mongoose.models.MaterialCategory || mongoose.model('MaterialCategory', materialCategorySchema);
  built = { MaterialCategory };
  return built;
}

module.exports = {
  CATEGORY_RECORD_STATUS,
  get MaterialCategory() { return build().MaterialCategory; },
};
