const {
  ESCROW_STATUS,
  availableBalance,
  roundVnd,
  canReleaseEscrow,
} = require('./contractor-finance');

function emptyLedger() {
  return {
    acceptedQuoteTotal: 0,
    capturedDeposit: 0,
    heldAmount: 0,
    disputedAmount: 0,
    refundPendingAmount: 0,
    refundedAmount: 0,
    payoutPendingAmount: 0,
    paidOutAmount: 0,
    platformFeePosted: 0,
    materialGmv: 0,
    mock: true,
  };
}

function addDepositRow(ledger, { finance = {}, escrow = {}, paymentStatus, includeQuote = true } = {}) {
  if (includeQuote) {
    ledger.acceptedQuoteTotal += roundVnd(finance.totalAmount);
  }
  if (paymentStatus === 'PAID' || paymentStatus === 'REFUNDED') {
    ledger.capturedDeposit += roundVnd(finance.depositAmount || escrow.grossAmount);
  }
  const status = escrow.status;
  const avail = availableBalance(escrow);
  if (status === ESCROW_STATUS.HELD) ledger.heldAmount += avail;
  if (status === ESCROW_STATUS.FROZEN) ledger.disputedAmount += avail;
  if (status === ESCROW_STATUS.REFUND_PENDING) {
    ledger.refundPendingAmount += roundVnd(escrow.proposedRefundAmount || avail);
  }
  ledger.refundedAmount += roundVnd(escrow.refundedAmount);
  if (status === ESCROW_STATUS.RELEASE_PENDING) {
    ledger.payoutPendingAmount += roundVnd(escrow.contractorHoldAmount);
  }
  ledger.paidOutAmount += roundVnd(escrow.releasedAmount);
  return ledger;
}

function escrowActions({ escrow, orderStatus, openComplaint, depositPaid }) {
  const payout = canReleaseEscrow({
    escrow,
    customerAccepted: orderStatus === 'CUSTOMER_ACCEPTED',
    remainingSettled: Boolean(escrow.remainingSettled),
    openComplaint: Boolean(openComplaint),
    depositPaid,
  });
  const refundable = [
    ESCROW_STATUS.HELD,
    ESCROW_STATUS.FROZEN,
    ESCROW_STATUS.RELEASE_PENDING,
    ESCROW_STATUS.REFUND_PENDING,
  ].includes(escrow.status);
  return {
    canPayout: payout.ok,
    payoutBlock: payout.ok ? null : payout.code,
    canRefund: refundable && availableBalance(escrow) > 0,
    refundBlock: refundable ? null : 'ESCROW_NOT_REFUNDABLE',
  };
}

module.exports = { emptyLedger, addDepositRow, escrowActions };
