
const POLICY_TYPES = Object.freeze({
  TERMS_OF_SERVICE: 'TERMS_OF_SERVICE',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
  CUSTOMER_POLICY: 'CUSTOMER_POLICY',
  CONTRACTOR_POLICY: 'CONTRACTOR_POLICY',
  MATERIAL_STORE_POLICY: 'MATERIAL_STORE_POLICY',
  PAYMENT_POLICY: 'PAYMENT_POLICY',
  REFUND_POLICY: 'REFUND_POLICY',
  COMMUNITY_GUIDELINE: 'COMMUNITY_GUIDELINE',
});

const POLICY_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const policySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: Object.values(POLICY_TYPES), required: true, index: true },
    content: { type: String, required: true },
    language: { type: String, enum: ['vi', 'en'], required: true, index: true },
    version: { type: String, required: true, trim: true, maxlength: 32 },
    status: { type: String, enum: Object.values(POLICY_STATUS), default: POLICY_STATUS.DRAFT, index: true },
    effectiveDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

policySchema.index({ type: 1, language: 1, status: 1 });

const Policy = mongoose.models.Policy || mongoose.model('Policy', policySchema);
  built = { Policy };
  return built;
}

module.exports = {
  POLICY_TYPES,
  POLICY_STATUS,
  get Policy() { return build().Policy; },
};
