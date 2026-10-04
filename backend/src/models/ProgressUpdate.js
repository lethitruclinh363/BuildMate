const mongoose = require('mongoose');
const { PROGRESS_STATUS } = require('../utils/order.rules');

const progressUpdateSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PROGRESS_STATUS),
      required: true,
    },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    images: { type: [String], default: [] },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'progressupdates' }
);

progressUpdateSchema.index({ orderId: 1, createdAt: 1 });

progressUpdateSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    orderId: this.orderId,
    status: this.status,
    description: this.description,
    images: this.images,
    actorId: this.actorId || null,
    location: this.location?.coordinates ? this.location : null,
    createdAt: this.createdAt,
  };
};

const ProgressUpdate = mongoose.model('ProgressUpdate', progressUpdateSchema);

module.exports = { ProgressUpdate, PROGRESS_STATUS };
