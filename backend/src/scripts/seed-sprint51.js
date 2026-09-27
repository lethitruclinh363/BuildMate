const { Quotation, QUOTATION_STATUS } = require('../models/Quotation');
const { RepairRequest } = require('../models/RepairRequest');
const { Order } = require('../models/Order');
const orderService = require('../services/order.service');

async function seedSprint51() {
  const leak = await RepairRequest.findOne({ title: 'Bathroom leak above the downstairs ceiling' });
  if (!leak) {
    console.warn('[seed] Sprint 5.1 skipped — leak request missing');
    return;
  }

  const leakQuote = await Quotation.findOne({ requestId: leak._id, status: QUOTATION_STATUS.ACCEPTED });
  if (!leakQuote) {
    console.warn('[seed] Sprint 5.1 skipped — accepted quotation missing');
    return;
  }

  const existing = await Order.findOne({ quotationId: leakQuote._id });
  if (existing) {
    if (String(existing.storeId || '') !== String(leak.storeId || '')) {
      existing.storeId = leak.storeId || null;
      await existing.save();
    }
    console.log('[seed] Sprint 5.1 order already present', existing.orderCode);
    return;
  }

  const bundle = await orderService.createFromQuotation(leakQuote, leak, leak.customerId);
  console.log('[seed] Sprint 5.1 construction order', bundle.order.orderCode, bundle.order.status);
}

module.exports = { seedSprint51 };
