const { env } = require('../config/env');

if (env.databaseProvider === 'postgres') {
  module.exports = require('./materialOrder.postgres');
} else {
  const { MaterialOrder } = require('../models/MaterialOrder');

  /**
   * Bản MongoDB của `cancelOrderAtomic`: dùng findOneAndUpdate có điều kiện
   * trạng thái ($in) nên chỉ một request thắng khi hủy đồng thời.
   */
  async function cancelOrderAtomic({ orderId, allowedStatuses, actorUserId, actorRole, note }) {
    const order = await MaterialOrder.findOne({ _id: orderId });
    if (!order) return { ok: false, reason: 'NOT_FOUND' };
    if (order.status === 'CANCELLED') return { ok: false, reason: 'ALREADY_CANCELLED' };

    const updated = await MaterialOrder.findOneAndUpdate(
      { _id: orderId, status: { $in: [...allowedStatuses] } },
      {
        $set: { status: 'CANCELLED', updatedAt: new Date() },
        $push: {
          statusHistory: {
            status: 'CANCELLED',
            actorId: actorUserId || null,
            actorRole,
            note: note || '',
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!updated) return { ok: false, reason: 'CONFLICT' };
    return { ok: true };
  }

  module.exports = {
    MaterialOrder,
    MaterialOrderPayment: require('../models/MaterialOrderPayment').MaterialOrderPayment,
    MaterialCommission: require('../models/MaterialCommission').MaterialCommission,
    cancelOrderAtomic,
  };
}
