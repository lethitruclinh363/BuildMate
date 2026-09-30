const mongoose = require('mongoose');

const AUDIT_ACTION = Object.freeze({
  ADMIN_APPROVE: 'ADMIN_APPROVE',
  ADMIN_REJECT: 'ADMIN_REJECT',
  QUOTATION_SENT: 'QUOTATION_SENT',
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  QUOTATION_REJECTED: 'QUOTATION_REJECTED',
  QUOTATION_MODIFY: 'QUOTATION_MODIFY',
  REQUEST_STATUS: 'REQUEST_STATUS',
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  AVATAR_UPDATE: 'AVATAR_UPDATE',
  ORDER_CREATED: 'ORDER_CREATED',
  PROGRESS_UPDATED: 'PROGRESS_UPDATED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_PAID: 'PAYMENT_PAID',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  COMMISSION_CREATED: 'COMMISSION_CREATED',
  REVIEW_CREATED: 'REVIEW_CREATED',
  REVIEW_REPORTED: 'REVIEW_REPORTED',
  COMPLAINT_CREATED: 'COMPLAINT_CREATED',
  COMPLAINT_RESOLVED: 'COMPLAINT_RESOLVED',
  FEE_CHANGED: 'FEE_CHANGED',
  POLICY_UPDATED: 'POLICY_UPDATED',
});

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, default: '' },
    action: { type: String, enum: Object.values(AUDIT_ACTION), required: true, index: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, default: '', index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

auditLogSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    actorId: this.actorId,
    actorRole: this.actorRole,
    action: this.action,
    entityType: this.entityType,
    entityId: this.entityId,
    meta: this.meta,
    ip: this.ip,
    createdAt: this.createdAt,
  };
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = { AuditLog, AUDIT_ACTION };
