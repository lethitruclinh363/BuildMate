const mongoose = require('mongoose');

const REVIEW_TARGET = Object.freeze({
  CONTRACTOR: 'CONTRACTOR',
  MATERIAL_STORE: 'MATERIAL_STORE',
});

const reviewSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: Object.values(REVIEW_TARGET),
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: '', maxlength: 1000 },
    images: { type: [String], default: [] },
    contractorReply: { type: String, trim: true, default: '', maxlength: 500 },
    repliedAt: { type: Date, default: null },
    reportedAt: { type: Date, default: null },
    reportReason: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { timestamps: true, collection: 'reviews' }
);

reviewSchema.index({ orderId: 1, customerId: 1, targetUserId: 1, targetType: 1 }, { unique: true });
reviewSchema.index({ targetUserId: 1, targetType: 1, createdAt: -1 });

reviewSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderId: this.orderId,
    customerId: this.customerId,
    targetUserId: this.targetUserId,
    targetType: this.targetType,
    rating: this.rating,
    comment: this.comment,
    images: this.images,
    contractorReply: this.contractorReply || '',
    repliedAt: this.repliedAt,
    reported: Boolean(this.reportedAt),
    createdAt: this.createdAt,
  };
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = { Review, REVIEW_TARGET };
