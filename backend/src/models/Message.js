const mongoose = require('mongoose');

const MESSAGE_TYPE = Object.freeze({
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  QUOTATION: 'QUOTATION',
  LOCATION: 'LOCATION',
});

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatRoom',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(MESSAGE_TYPE),
      default: MESSAGE_TYPE.TEXT,
    },
    content: { type: String, default: '', maxlength: 4000 },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, default: '', maxlength: 300 },
      label: { type: String, default: '', maxlength: 120 },
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ roomId: 1, createdAt: 1 });

messageSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    roomId: this.roomId,
    senderId: this.senderId,
    type: this.type,
    content: this.content,
    location:
      this.location && Number.isFinite(this.location.lat) && Number.isFinite(this.location.lng)
        ? {
            lat: this.location.lat,
            lng: this.location.lng,
            address: this.location.address || '',
            label: this.location.label || '',
          }
        : null,
    quotationId: this.quotationId,
    read: this.read,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const Message = mongoose.model('Message', messageSchema);

module.exports = { Message, MESSAGE_TYPE };
