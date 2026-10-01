const mongoose = require('mongoose');
const { POLICY_TYPES, POLICY_STATUS } = require('./Policy');

const policyRevisionSchema = new mongoose.Schema(
  {
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(POLICY_TYPES), required: true },
    content: { type: String, required: true },
    language: { type: String, enum: ['vi', 'en'], required: true },
    version: { type: String, required: true, trim: true },
    status: { type: String, enum: Object.values(POLICY_STATUS), required: true },
    effectiveDate: { type: Date, default: null },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const PolicyRevision = mongoose.models.PolicyRevision || mongoose.model('PolicyRevision', policyRevisionSchema);

module.exports = { PolicyRevision };
