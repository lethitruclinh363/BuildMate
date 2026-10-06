const mongoose = require('mongoose');

const SUGGESTION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONVERTED: 'CONVERTED',
});

const serviceSuggestionSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requesterRole: { type: String, enum: ['CONTRACTOR'], required: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContractorProfile', default: null },
    teamName: { type: String, trim: true, default: '', maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: Object.values(SUGGESTION_STATUS), default: SUGGESTION_STATUS.PENDING, index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    adminNote: { type: String, trim: true, default: '', maxlength: 500 },
    convertedServiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogService', default: null },
  },
  { timestamps: true }
);

serviceSuggestionSchema.methods.toPublic = function toPublic() {
  const requester = this.requesterId && this.requesterId.name ? this.requesterId : null;
  return {
    id: String(this._id),
    requesterId: String(requester ? requester._id : this.requesterId),
    requesterName: requester?.name || '',
    requesterRole: this.requesterRole,
    providerId: this.providerId ? String(this.providerId) : '',
    teamName: this.teamName || '',
    description: this.description,
    status: this.status,
    adminNote: this.adminNote || '',
    convertedServiceId: this.convertedServiceId ? String(this.convertedServiceId) : '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    reviewedAt: this.reviewedAt,
  };
};

const ServiceSuggestion = mongoose.models.ServiceSuggestion || mongoose.model('ServiceSuggestion', serviceSuggestionSchema);

module.exports = { ServiceSuggestion, SUGGESTION_STATUS };
