const mongoose = require('mongoose');

const NOTIFICATION_TYPE = Object.freeze({
  REQUEST: 'REQUEST',
  MESSAGE: 'MESSAGE',
  QUOTATION: 'QUOTATION',
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  QUOTATION_REJECTED: 'QUOTATION_REJECTED',
  QUOTATION_MODIFY: 'QUOTATION_MODIFY',
  STATUS_UPDATE: 'STATUS_UPDATE',
  ORDER_CREATED: 'ORDER_CREATED',
  PROGRESS_UPDATED: 'PROGRESS_UPDATED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  CONTRACTOR_ACCEPTED_JOB: 'CONTRACTOR_ACCEPTED_JOB',
  CONTRACTOR_STARTED_JOB: 'CONTRACTOR_STARTED_JOB',
  CONTRACTOR_UPDATED_PROGRESS: 'CONTRACTOR_UPDATED_PROGRESS',
  CONTRACTOR_COMPLETED_JOB: 'CONTRACTOR_COMPLETED_JOB',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  COMMISSION_CREATED: 'COMMISSION_CREATED',
  NEW_REVIEW: 'NEW_REVIEW',
  NEW_COMPLAINT: 'NEW_COMPLAINT',
  COMPLAINT_UPDATED: 'COMPLAINT_UPDATED',
});

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, required: true, maxlength: 400 },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: true,
    },
    isRead: { type: Boolean, default: false, index: true },
    link: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

notificationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    userId: this.userId,
    title: this.title,
    message: this.message,
    type: this.type,
    isRead: this.isRead,
    link: this.link,
    meta: this.meta,
    createdAt: this.createdAt,
  };
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification, NOTIFICATION_TYPE };
