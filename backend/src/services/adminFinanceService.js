const { PAYMENT_TYPE } = require('../models/Payment');
const { COMMISSION_STATUS } = require('../models/Commission');
const { Order, Payment, Commission } = require('../repositories/commerceAccess');
const escrowService = require('./escrowService');
const { emptyLedger, addDepositRow, escrowActions } = require('../utils/admin-finance-ledger');
const { roundVnd } = require('../utils/contractor-finance');

async function buildLedger() {
  const ledger = emptyLedger();
  const deposits = await Payment.find({ type: PAYMENT_TYPE.DEPOSIT });
  for (const payment of deposits) {
    const { finance, escrow } = escrowService.financeOf(payment);
    addDepositRow(ledger, { finance, escrow, paymentStatus: payment.status });
  }
  const posted = await Commission.find({ status: COMMISSION_STATUS.POSTED });
  ledger.platformFeePosted = posted.reduce((sum, row) => sum + roundVnd(row.platformAmount), 0);
  try {
    const { MaterialOrder } = require('../repositories/materialOrderAccess');
    const materialRows = await MaterialOrder.find({
      status: { $in: ['COMPLETED', 'CUSTOMER_RECEIVED'] },
    }).select('totalAmount');
    ledger.materialGmv = materialRows.reduce((sum, row) => sum + roundVnd(row.totalAmount), 0);
  } catch (_err) {
    ledger.materialGmv = 0;
  }
  ledger.mock = true;
  return ledger;
}

async function listEscrows() {
  const deposits = await Payment.find({ type: PAYMENT_TYPE.DEPOSIT }).sort({ createdAt: -1 });
  const rows = [];
  for (const payment of deposits) {
    const order = await Order.findById(payment.orderId);
    const { finance, escrow } = escrowService.financeOf(payment);
    const openComplaint = await escrowService.hasOpenComplaint(payment.orderId);
    const actions = escrowActions({
      escrow,
      orderStatus: order ? order.status : null,
      openComplaint,
      depositPaid: payment.status === 'PAID',
    });
    rows.push({
      orderId: String(payment.orderId),
      orderCode: order ? order.orderCode : null,
      customerId: String(payment.customerId),
      contractorId: String(payment.contractorId),
      workStatus: order ? order.status : null,
      accepted: order ? order.status === 'CUSTOMER_ACCEPTED' : false,
      paymentId: String(payment._id),
      paymentStatus: payment.status,
      paymentType: payment.type,
      quoteTotal: finance.totalAmount,
      depositAmount: finance.depositAmount,
      platformFee: finance.platformFee,
      contractorHold: finance.contractorHold,
      remainingAmount: finance.remainingAmount,
      remainingSettled: Boolean(escrow.remainingSettled),
      escrowStatus: escrow.status,
      payoutStatus: escrow.payoutStatus,
      refundedAmount: escrow.refundedAmount || 0,
      releasedAmount: escrow.releasedAmount || 0,
      cancelCase: escrow.cancelCase,
      cancelReason: escrow.cancelReason,
      openComplaint,
      mock: true,
      actions,
    });
  }
  return rows;
}

module.exports = { buildLedger, listEscrows };
