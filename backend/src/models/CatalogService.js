const mongoose = require('mongoose');
const { CONTRACTOR_SERVICE_CATEGORIES } = require('../constants/contractorServices');

const CATALOG_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

const LIVE_CATALOG_STATUSES = Object.freeze([CATALOG_STATUS.ACTIVE, CATALOG_STATUS.APPROVED]);

// Shared BuildMate catalog. Priced contractor offerings stay on the Service model.
const catalogServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    normalizedName: { type: String, required: true },
    foldedName: { type: String, default: '' },
    code: { type: String, default: '' },
    category: { type: String, required: true, enum: CONTRACTOR_SERVICE_CATEGORIES },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    type: { type: String, enum: ['SYSTEM', 'CUSTOM'], default: 'CUSTOM' },
    status: {
      type: String,
      enum: Object.values(CATALOG_STATUS),
      default: CATALOG_STATUS.PENDING_APPROVAL,
      index: true,
    },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

catalogServiceSchema.index({ normalizedName: 1 }, { unique: true });
catalogServiceSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $gt: '' } } });

catalogServiceSchema.methods.toPublic = function toPublic() {
  const code = this.code || '';
  const labelKey = code.includes('::') ? code.split('::').pop() : '';
  return {
    id: this._id,
    name: this.name,
    category: this.category,
    description: this.description || '',
    type: this.type === 'SYSTEM' ? 'SYSTEM' : 'CUSTOM',
    status: this.status === CATALOG_STATUS.APPROVED ? CATALOG_STATUS.ACTIVE : this.status,
    catalogKey: code || String(this._id),
    serviceId: code || String(this._id),
    labelKey,
    proposedBy: this.proposedBy || null,
  };
};

const CatalogService = mongoose.models.CatalogService || mongoose.model('CatalogService', catalogServiceSchema);

module.exports = { CatalogService, CATALOG_STATUS, LIVE_CATALOG_STATUSES };
