const DEPOSIT_RATE = 0.15;
const PLATFORM_FEE_RATE = 0.05;
const CONTRACTOR_POLICY_VERSION = 'CONTRACTOR_V2_ESCROW';
const MATERIAL_POLICY_VERSION = 'MATERIAL_V2_FREE';
const MATERIAL_LEGACY_POLICY_VERSION = 'MATERIAL_V1_DEPOSIT';
const DEPOSIT_TERMS_VERSION = 'CONTRACTOR_DEPOSIT_TERMS_V2_DRAFT';

const ESCROW_STATUS = Object.freeze({
  NOT_FUNDED: 'NOT_FUNDED',
  HELD: 'HELD',
  FROZEN: 'FROZEN',
  RELEASE_PENDING: 'RELEASE_PENDING',
  RELEASED: 'RELEASED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  CANCELLED_SETTLED: 'CANCELLED_SETTLED',
});

const PAYOUT_STATUS = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
});

const CANCEL_CASE = Object.freeze({
  UNPAID: 'UNPAID',
  CUSTOMER_AFTER_DEPOSIT: 'CUSTOMER_AFTER_DEPOSIT',
  CONTRACTOR_CANCEL: 'CONTRACTOR_CANCEL',
  MUTUAL: 'MUTUAL',
  DISPUTE: 'DISPUTE',
});

const LEDGER_TYPE = Object.freeze({
  HOLD: 'HOLD',
  FREEZE: 'FREEZE',
  RELEASE_PENDING: 'RELEASE_PENDING',
  PAYOUT: 'PAYOUT',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUND: 'REFUND',
  CANCEL: 'CANCEL',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  NOT_FUNDED: Object.freeze(['HELD', 'CANCELLED_SETTLED']),
  HELD: Object.freeze(['FROZEN', 'RELEASE_PENDING', 'REFUND_PENDING']),
  FROZEN: Object.freeze(['FROZEN', 'REFUND_PENDING', 'RELEASE_PENDING', 'CANCELLED_SETTLED']),
  RELEASE_PENDING: Object.freeze(['RELEASED', 'FROZEN', 'REFUND_PENDING']),
  REFUND_PENDING: Object.freeze(['REFUNDED', 'FROZEN']),
  RELEASED: Object.freeze([]),
  REFUNDED: Object.freeze([]),
  CANCELLED_SETTLED: Object.freeze([]),
});

function roundVnd(value) {
  return Math.round(Number(value) || 0);
}

function availableBalance(escrow) {
  return roundVnd(escrow.grossAmount) - roundVnd(escrow.releasedAmount) - roundVnd(escrow.refundedAmount);
}

function identitiesHold(snap) {
  return (
    snap.depositAmount === snap.platformFee + snap.contractorHold
    && snap.totalAmount === snap.depositAmount + snap.remainingAmount
    && snap.contractorTotalEarning === snap.remainingAmount + snap.contractorHold
  );
}

function snapshotContractorQuote(totalAmount, { depositRate = DEPOSIT_RATE, platformFeeRate = PLATFORM_FEE_RATE } = {}) {
  const total = roundVnd(totalAmount);
  const depositAmount = roundVnd(total * depositRate);
  const platformFee = roundVnd(total * platformFeeRate);
  const contractorHold = depositAmount - platformFee;
  const remainingAmount = total - depositAmount;
  const contractorTotalEarning = remainingAmount + contractorHold;
  const snap = {
    policyVersion: CONTRACTOR_POLICY_VERSION,
    totalAmount: total,
    depositRate,
    platformFeeRate,
    depositAmount,
    platformFee,
    contractorHold,
    remainingAmount,
    contractorTotalEarning,
    mockLedger: true,
  };
  snap.ok = total >= 0 && contractorHold >= 0 && remainingAmount >= 0 && identitiesHold(snap);
  return snap;
}

function defaultEscrowRecord(snapshot) {
  return {
    status: ESCROW_STATUS.NOT_FUNDED,
    version: 0,
    grossAmount: snapshot.depositAmount,
    platformFeeAmount: snapshot.platformFee,
    contractorHoldAmount: snapshot.contractorHold,
    releasedAmount: 0,
    refundedAmount: 0,
    payoutStatus: PAYOUT_STATUS.NONE,
    payoutAmount: 0,
    remainingSettled: false,
    remainingSettledAt: null,
    remainingSettledBy: null,
    proposedRefundAmount: null,
    cancelCase: null,
    cancelReason: null,
    mock: true,
  };
}

function canTransition(from, to) {
  if (from === to && to === ESCROW_STATUS.FROZEN) return { ok: true, code: null };
  if ((ALLOWED_TRANSITIONS[from] || []).includes(to)) return { ok: true, code: null };
  return { ok: false, code: 'ILLEGAL_TRANSITION' };
}

function bump(escrow, patch) {
  return { ...escrow, ...patch, version: roundVnd(escrow.version) + 1, mock: true };
}

function applyDepositCaptured(escrow, at = new Date()) {
  const gate = canTransition(escrow.status, ESCROW_STATUS.HELD);
  if (!gate.ok && escrow.status !== ESCROW_STATUS.HELD) {
    return { ok: false, code: gate.code || 'ESCROW_NOT_OPEN', escrow };
  }
  if (escrow.status === ESCROW_STATUS.HELD) return { ok: true, escrow, duplicated: true };
  return {
    ok: true,
    escrow: bump(escrow, { status: ESCROW_STATUS.HELD, heldAt: escrow.heldAt || at.toISOString() }),
  };
}

function freezeEscrow(escrow, at = new Date()) {
  const gate = canTransition(escrow.status, ESCROW_STATUS.FROZEN);
  if (!gate.ok) return { ok: false, code: 'ESCROW_CANNOT_FREEZE', escrow };
  return {
    ok: true,
    escrow: bump(escrow, {
      status: ESCROW_STATUS.FROZEN,
      frozenAt: at.toISOString(),
      cancelCase: escrow.cancelCase || CANCEL_CASE.DISPUTE,
    }),
  };
}

function markReleasePending(escrow) {
  const gate = canTransition(escrow.status, ESCROW_STATUS.RELEASE_PENDING);
  if (!gate.ok) return { ok: false, code: gate.code, escrow };
  return { ok: true, escrow: bump(escrow, { status: ESCROW_STATUS.RELEASE_PENDING }) };
}

function markRefundPending(escrow, amount) {
  const gate = canTransition(escrow.status, ESCROW_STATUS.REFUND_PENDING);
  if (!gate.ok) return { ok: false, code: gate.code, escrow };
  const refundAmount = roundVnd(amount);
  if (refundAmount <= 0 || refundAmount > availableBalance(escrow)) {
    return { ok: false, code: 'ESCROW_OVERDRAW', escrow };
  }
  return {
    ok: true,
    escrow: bump(escrow, { status: ESCROW_STATUS.REFUND_PENDING, proposedRefundAmount: refundAmount }),
  };
}

function canStartWork(orderStatus, escrowStatus) {
  return orderStatus === 'DEPOSIT_PAID' && escrowStatus === ESCROW_STATUS.HELD;
}

function isDisputeFreeze(escrow) {
  return (
    escrow.status === ESCROW_STATUS.FROZEN
    && (!escrow.cancelCase || escrow.cancelCase === CANCEL_CASE.DISPUTE)
  );
}

function canReleaseEscrow({ escrow, customerAccepted, remainingSettled, openComplaint, depositPaid = true }) {
  if (!depositPaid) return { ok: false, code: 'DEPOSIT_NOT_PAID' };
  if (openComplaint) return { ok: false, code: 'ESCROW_FROZEN_BY_COMPLAINT' };
  if (!customerAccepted) return { ok: false, code: 'CUSTOMER_ACCEPTANCE_REQUIRED' };
  if (!remainingSettled) return { ok: false, code: 'REMAINING_SETTLEMENT_REQUIRED' };
  if (escrow.status === ESCROW_STATUS.RELEASED) return { ok: false, code: 'ALREADY_RELEASED' };
  if (escrow.status === ESCROW_STATUS.REFUNDED || escrow.status === ESCROW_STATUS.CANCELLED_SETTLED) {
    return { ok: false, code: 'ESCROW_CLOSED' };
  }
  if (escrow.status === ESCROW_STATUS.FROZEN && !isDisputeFreeze(escrow)) {
    return { ok: false, code: 'ESCROW_FROZEN' };
  }
  if (escrow.status === ESCROW_STATUS.REFUND_PENDING) return { ok: false, code: 'REFUND_IN_FLIGHT' };
  if (
    escrow.status !== ESCROW_STATUS.HELD
    && escrow.status !== ESCROW_STATUS.RELEASE_PENDING
    && !isDisputeFreeze(escrow)
  ) {
    return { ok: false, code: 'ESCROW_NOT_HELD' };
  }
  if (availableBalance(escrow) < roundVnd(escrow.contractorHoldAmount)) {
    return { ok: false, code: 'ESCROW_BALANCE_SHORT' };
  }
  return { ok: true, code: null };
}

function releaseEscrow(escrow, at = new Date()) {
  if (escrow.payoutStatus === PAYOUT_STATUS.PAID || escrow.status === ESCROW_STATUS.RELEASED) {
    return { ok: false, code: 'PAYOUT_ALREADY_PAID', escrow };
  }
  let current = escrow;
  if (current.status === ESCROW_STATUS.HELD) {
    const pending = markReleasePending(current);
    if (!pending.ok) return pending;
    current = pending.escrow;
  }
  const gate = canTransition(current.status, ESCROW_STATUS.RELEASED);
  if (!gate.ok) return { ok: false, code: gate.code, escrow: current };
  const hold = roundVnd(current.contractorHoldAmount);
  if (availableBalance(current) < hold) {
    return { ok: false, code: 'ESCROW_BALANCE_SHORT', escrow: current };
  }
  return {
    ok: true,
    escrow: bump(current, {
      status: ESCROW_STATUS.RELEASED,
      releasedAt: at.toISOString(),
      releasedAmount: hold,
      payoutStatus: PAYOUT_STATUS.PAID,
      payoutAmount: hold,
      payoutMock: true,
    }),
  };
}

function refundEscrow(escrow, { fullDeposit = true, amount = null } = {}, at = new Date()) {
  if (escrow.status === ESCROW_STATUS.REFUNDED) return { ok: false, code: 'ALREADY_REFUNDED', escrow };
  if (escrow.status === ESCROW_STATUS.RELEASED) return { ok: false, code: 'ALREADY_RELEASED', escrow };
  let current = escrow;
  if (current.status !== ESCROW_STATUS.REFUND_PENDING) {
    const pendingAmount = amount == null
      ? (fullDeposit ? roundVnd(current.grossAmount) : roundVnd(current.contractorHoldAmount))
      : roundVnd(amount);
    const pending = markRefundPending(current, pendingAmount);
    if (!pending.ok) return pending;
    current = pending.escrow;
  }
  const refundAmount = roundVnd(current.proposedRefundAmount || amount || current.grossAmount);
  if (refundAmount > availableBalance(current)) {
    return { ok: false, code: 'ESCROW_OVERDRAW', escrow: current };
  }
  const toRefunded = canTransition(current.status, ESCROW_STATUS.REFUNDED);
  if (!toRefunded.ok) return { ok: false, code: toRefunded.code, escrow: current };
  return {
    ok: true,
    escrow: bump(current, {
      status: ESCROW_STATUS.REFUNDED,
      refundedAt: at.toISOString(),
      refundedAmount: roundVnd(current.refundedAmount) + refundAmount,
      proposedRefundAmount: null,
      payoutStatus: PAYOUT_STATUS.NONE,
      mockRefund: true,
    }),
  };
}

function cancelWithoutFunding(escrow) {
  const gate = canTransition(escrow.status, ESCROW_STATUS.CANCELLED_SETTLED);
  if (!gate.ok) return { ok: false, code: gate.code, escrow };
  return {
    ok: true,
    escrow: bump(escrow, { status: ESCROW_STATUS.CANCELLED_SETTLED, cancelCase: CANCEL_CASE.UNPAID }),
  };
}

function holdCustomerCancel(escrow, reason, at = new Date()) {
  const frozen = freezeEscrow({
    ...escrow,
    cancelCase: CANCEL_CASE.CUSTOMER_AFTER_DEPOSIT,
    cancelReason: reason || 'Customer cancelled after deposit',
  }, at);
  return frozen;
}

function recordDepositTerms({ userId, at = new Date() } = {}) {
  return {
    accepted: true,
    version: DEPOSIT_TERMS_VERSION,
    policyVersion: CONTRACTOR_POLICY_VERSION,
    acceptedAt: at.toISOString(),
    acceptedBy: userId ? String(userId) : null,
    mock: true,
  };
}

function assertDepositTermsAccepted(metadata) {
  const row = metadata && metadata.termsAcceptance;
  if (!row || row.accepted !== true) return { ok: false, code: 'TERMS_NOT_ACCEPTED' };
  if (row.version !== DEPOSIT_TERMS_VERSION) return { ok: false, code: 'TERMS_VERSION_STALE' };
  return { ok: true, code: null };
}

function isLegacyMaterialOrder(order) {
  return Number(order?.depositRateSnapshot || 0) > 0 || Number(order?.depositAmount || 0) > 0;
}

function snapshotMaterialFree({ materialSubtotal, shippingFee }) {
  const subtotal = roundVnd(materialSubtotal);
  const shipping = roundVnd(shippingFee);
  const totalAmount = subtotal + shipping;
  const snap = {
    policyVersion: MATERIAL_POLICY_VERSION,
    materialSubtotal: subtotal,
    shippingFee: shipping,
    totalAmount,
    depositRateSnapshot: 0,
    depositAmount: 0,
    platformFeeRateSnapshot: 0,
    platformFeeAmount: 0,
    storeDepositAmount: 0,
    remainingAmount: totalAmount,
    paymentMethod: 'COD',
  };
  if (subtotal < 0 || shipping < 0) {
    return { ok: false, code: 'INVALID_AMOUNT', ...snap };
  }
  return { ok: true, code: null, ...snap };
}

module.exports = {
  DEPOSIT_RATE,
  PLATFORM_FEE_RATE,
  CONTRACTOR_POLICY_VERSION,
  MATERIAL_POLICY_VERSION,
  MATERIAL_LEGACY_POLICY_VERSION,
  DEPOSIT_TERMS_VERSION,
  ESCROW_STATUS,
  PAYOUT_STATUS,
  CANCEL_CASE,
  LEDGER_TYPE,
  ALLOWED_TRANSITIONS,
  roundVnd,
  availableBalance,
  identitiesHold,
  snapshotContractorQuote,
  defaultEscrowRecord,
  canTransition,
  applyDepositCaptured,
  freezeEscrow,
  markReleasePending,
  markRefundPending,
  canStartWork,
  canReleaseEscrow,
  releaseEscrow,
  refundEscrow,
  cancelWithoutFunding,
  holdCustomerCancel,
  recordDepositTerms,
  assertDepositTermsAccepted,
  isLegacyMaterialOrder,
  snapshotMaterialFree,
};
