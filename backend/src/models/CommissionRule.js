const mongoose = require('mongoose');

const commissionRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    percentage: { type: Number, required: true, min: 0, max: 30 },
    active: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'commissionrules' }
);

commissionRuleSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    percentage: this.percentage,
    active: this.active,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const CommissionRule = mongoose.model('CommissionRule', commissionRuleSchema);

module.exports = { CommissionRule };
