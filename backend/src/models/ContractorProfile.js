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
  CCCD_FRONT: 'CCCD_FRONT',
  CCCD_BACK: 'CCCD_BACK',
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
    representativeName: { type: String, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, default: '' },
    workerCount: { type: Number, default: 0, min: 0, max: 500 },
    taxCode: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: 'Can Tho' },
    description: { type: String, trim: true, default: '', maxlength: 1200 },
    yearsExperience: { type: Number, default: 0, min: 0, max: 80 },
    serviceAreas: { type: [String], default: [] },
    services: {
      type: [
        new mongoose.Schema(
          {
            category: { type: String, trim: true, default: '' },
            name: { type: String, required: true, trim: true },
            type: { type: String, enum: ['SYSTEM', 'CUSTOM'], default: 'SYSTEM' },
            serviceId: { type: String, default: null },
            status: {
              type: String,
              enum: ['APPROVED', 'PENDING_APPROVAL', 'REJECTED'],
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.DRAFT,
      index: true,
    },
    portfolio: {
      avatar: { type: String, default: '' },
      teamLogo: { type: String, default: '' },
      workshop: { type: String, default: '' },
      construction: { type: [String], default: [] },
      certificates: { type: [String], default: [] },
    },
    documents: { type: [documentSchema], default: [] },
    completedSteps: { type: [Boolean], default: () => [false, false, false, false, false, false] },
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
    representativeName: this.representativeName,
    contactPhone: this.contactPhone,
    contactEmail: this.contactEmail,
    workerCount: this.workerCount,
    taxCode: this.taxCode,
    address: this.address,
    city: this.city,
    description: this.description,
    yearsExperience: this.yearsExperience,
    serviceAreas: this.serviceAreas,
    services: (this.services || []).map((item) => {
      const type = item.type === 'CUSTOM' ? 'CUSTOM' : 'SYSTEM';
      return {
        category: item.category || '',
        name: item.name,
        type,
        serviceId: type === 'CUSTOM' ? item.serviceId || null : item.serviceId || `${item.category}::${item.name}`,
        status: item.status || (type === 'CUSTOM' ? 'PENDING_APPROVAL' : 'APPROVED'),
      };
    }),
    portfolio: {
      avatar: this.portfolio?.avatar || '',
      teamLogo: this.portfolio?.teamLogo || '',
      workshop: this.portfolio?.workshop || '',
      construction: this.portfolio?.construction || [],
      certificates: this.portfolio?.certificates || [],
    },
    completedSteps: Array.from({ length: 6 }, (_, index) => this.completedSteps?.[index] === true),
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
