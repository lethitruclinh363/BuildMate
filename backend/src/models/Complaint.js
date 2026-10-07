
const COMPLAINT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  PROCESSING: 'PROCESSING',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
});

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const complaintSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    againstUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    attachments: { type: [String], default: [] },
    status: {
      type: String,
      enum: Object.values(COMPLAINT_STATUS),
      default: COMPLAINT_STATUS.OPEN,
      index: true,
    },
    adminNote: { type: String, trim: true, default: '', maxlength: 2000 },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'complaints' }
);

complaintSchema.index({ createdBy: 1, createdAt: -1 });
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ orderId: 1, createdAt: -1 });

complaintSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderId: this.orderId,
    createdBy: this.createdBy,
    againstUser: this.againstUser,
    reason: this.reason,
    description: this.description,
    attachments: this.attachments,
    status: this.status,
    adminNote: this.adminNote,
    adminId: this.adminId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Complaint = mongoose.model('Complaint', complaintSchema);
  built = { Complaint };
  return built;
}

module.exports = {
  COMPLAINT_STATUS,
  get Complaint() { return build().Complaint; },
};
