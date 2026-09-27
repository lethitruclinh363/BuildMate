const mongoose = require('mongoose');

const MATERIAL_CATEGORIES = Object.freeze([
  'Cement',
  'Paint',
  'Pipe',
  'Tiles',
  'Steel',
  'Waterproof coat',
  'Tools',
  'Fixtures',
]);

const materialSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },
    unit: { type: String, default: 'bag', trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    minOrderQty: { type: Number, default: 1, min: 1 },
    image: { type: String, default: '' },
    images: { type: [String], default: [] },
    description: { type: String, trim: true, default: '', maxlength: 800 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

materialSchema.index({ storeId: 1, isActive: 1 });
materialSchema.index({ category: 1 });

materialSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    storeId: this.storeId,
    name: this.name,
    category: this.category,
    sku: this.sku,
    unit: this.unit,
    price: this.price,
    stock: this.stock,
    minOrderQty: this.minOrderQty,
    image: this.image,
    images: this.images?.length ? this.images : this.image ? [this.image] : [],
    description: this.description,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Material = mongoose.model('Material', materialSchema);

module.exports = { Material, MATERIAL_CATEGORIES };
