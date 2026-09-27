const mongoose = require('mongoose');

const VERIFICATION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const DOCUMENT_TYPE = Object.freeze({
  BUSINESS_LICENSE: 'BUSINESS_LICENSE',
  CERTIFICATE: 'CERTIFICATE',
  ID_CARD: 'ID_CARD',
  STORE_IMAGE: 'STORE_IMAGE',
  PORTFOLIO: 'PORTFOLIO',
});

const documentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(DOCUMENT_TYPE), required: true },
    url: { type: String, required: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const contractorProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    businessName: { type: String, trim: true, default: '' },
    taxCode: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: 'Can Tho' },
    description: { type: String, trim: true, default: '', maxlength: 1200 },
    yearsExperience: { type: Number, default: 0, min: 0, max: 80 },
    serviceAreas: { type: [String], default: [] },
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.DRAFT,
      index: true,
    },
    documents: { type: [documentSchema], default: [] },
    rejectionReason: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

contractorProfileSchema.index({ verificationStatus: 1, submittedAt: -1 });

contractorProfileSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    userId: this.userId,
    businessName: this.businessName,
    taxCode: this.taxCode,
    address: this.address,
    city: this.city,
    description: this.description,
    yearsExperience: this.yearsExperience,
    serviceAreas: this.serviceAreas,
    verificationStatus: this.verificationStatus,
    documents: this.documents,
    rejectionReason: this.rejectionReason,
    submittedAt: this.submittedAt,
    reviewedAt: this.reviewedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const ContractorProfile = mongoose.model('ContractorProfile', contractorProfileSchema);

module.exports = { ContractorProfile, VERIFICATION_STATUS, DOCUMENT_TYPE };
