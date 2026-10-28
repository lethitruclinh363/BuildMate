

let built;
function build() {
  if (built) return built;
  const mongoose = require('mongoose');
const chatRoomSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RepairRequest',
      unique: true,
      sparse: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      index: true,
    },
    roomKind: {
      type: String,
      default: 'CUSTOMER_CONTRACTOR',
    },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatRoomSchema.index({ customerId: 1, lastMessageAt: -1 });
chatRoomSchema.index({ contractorId: 1, lastMessageAt: -1 });

chatRoomSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    customerId: this.customerId,
    contractorId: this.contractorId,
    requestId: this.requestId,
    storeId: this.storeId,
    roomKind: this.roomKind || 'CUSTOMER_CONTRACTOR',
    lastMessage: this.lastMessage,
    lastMessageAt: this.lastMessageAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
  built = { ChatRoom };
  return built;
}

module.exports = {
  get ChatRoom() { return build().ChatRoom; },
};
