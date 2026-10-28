const { Order, Payment, Commission, Complaint, runInTransaction } = require('../repositories/commerceAccess');
const escrowStore = require('../repositories/escrowStore');
const { COMMISSION_STATUS } = require('../models/Commission');
const { PAYMENT_TYPE } = require('../models/Payment');
const { PAYMENT_STATUS } = require('../models/Order');
const { ApiError } = require('../utils/ApiError');
const {
  applyDepositCaptured,
  freezeEscrow,
  canReleaseEscrow,
  releaseEscrow,
  refundEscrow,
  cancelWithoutFunding,
  holdCustomerCancel,
  markReleasePending,
  markRefundPending,
  ESCROW_STATUS,
  CANCEL_CASE,
  LEDGER_TYPE,
  snapshotContractorQuote,
  defaultEscrowRecord,
} = require('../utils/contractor-finance');
const { writeAudit, AUDIT_ACTION } = require('./auditService');

function financeOf(payment) {
  const meta = payment.metadata || {};
  const finance = meta.finance || snapshotContractorQuote(payment.amount);
  const escrow = meta.escrow || defaultEscrowRecord(finance);
  return { finance, escrow, meta };
}

async function hasOpenComplaint(orderId) {
  const rows = await Complaint.find({ orderId });
  return (rows || []).some((row) => row.status === 'OPEN' || row.status === 'PROCESSING');
}

function requireAdmin(user) {
  if (!user || user.role !== 'ADMIN') {
    throw new ApiError(403, 'Only an admin can settle or refund contractor escrow');
  }
}

async function applyChange(payment, fromStatus, nextEscrow, extra) {
  const { finance } = financeOf(payment);
  const saved = await escrowStore.persistTransition(payment, fromStatus, finance, nextEscrow, extra);
  if (!saved.ok) throw new ApiError(409, 'Escrow was updated concurrently', { code: saved.code });
  return nextEscrow;
}

async function ensureEscrowRow(payment, tx) {
  const { finance, escrow } = financeOf(payment);
  await escrowStore.insertEscrowRow(payment, finance, escrow, tx);
}

async function markDepositHeld(payment, tx) {
  const { finance, escrow } = financeOf(payment);
  await ensureEscrowRow(payment, tx);
  const next = applyDepositCaptured(escrow);
  if (!next.ok) throw new ApiError(409, 'Escrow cannot be funded', { code: next.code });
  if (next.duplicated) return next.escrow;
  await applyChange(payment, escrow.status, next.escrow, {
    ledger: {
      type: LEDGER_TYPE.HOLD,
      amount: finance.depositAmount,
      key: `hold:${payment.pgId || payment._id}`,
      note: 'Mock deposit captured and held',
    },
  });
  return next.escrow;
}

async function freezeIfComplaint(orderId) {
  const payment = await Payment.findOne({ orderId, type: PAYMENT_TYPE.DEPOSIT });
  if (!payment) return null;
  const open = await hasOpenComplaint(orderId);
  if (!open) return financeOf(payment).escrow;
  const { escrow, finance } = financeOf(payment);
  const next = freezeEscrow(escrow);
  if (!next.ok) return escrow;
  await applyChange(payment, escrow.status, next.escrow, {
    ledger: {
      type: LEDGER_TYPE.FREEZE,
      amount: 0,
      key: `freeze:${payment.pgId || payment._id}:${escrow.version || 0}`,
      note: 'Complaint opened',
    },
  });
  return next.escrow;
}

async function confirmRemaining(orderId, user) {
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(user.id);
  if (uid !== String(order.contractorId) && uid !== String(order.customerId) && user.role !== 'ADMIN') {
    throw new ApiError(403, 'You cannot confirm this settlement');
  }
  const payment = await Payment.findOne({ orderId: order._id, type: PAYMENT_TYPE.DEPOSIT });
  if (!payment) throw new ApiError(409, 'This order has no deposit escrow');
  const { finance, escrow } = financeOf(payment);
  if (escrow.remainingSettled) {
    return { order: order.toPublic(), payment: payment.toPublic(), mock: true, duplicated: true };
  }
  const fromStatus = escrow.status;
  escrow.remainingSettled = true;
  escrow.remainingSettledAt = new Date().toISOString();
  escrow.remainingSettledBy = uid;
  let next = escrow;
  if (
    escrow.status === ESCROW_STATUS.HELD
    && order.status === 'CUSTOMER_ACCEPTED'
    && !(await hasOpenComplaint(order._id))
  ) {
    const pending = markReleasePending(escrow);
    if (pending.ok) next = pending.escrow;
  }
  next.remainingSettled = true;
  next.remainingSettledAt = escrow.remainingSettledAt;
  next.remainingSettledBy = uid;
  await applyChange(payment, fromStatus, next, {
    ledger: {
      type: LEDGER_TYPE.RELEASE_PENDING,
      amount: 0,
      key: `remaining:${payment.pgId || payment._id}`,
      note: 'Direct 85% remaining confirmed (off platform)',
    },
  });
  return { order: order.toPublic(), payment: payment.toPublic(), mock: true };
}

async function maybeMarkReleasePending(orderId) {
  const order = await Order.findById(orderId);
  const payment = await Payment.findOne({ orderId, type: PAYMENT_TYPE.DEPOSIT });
  if (!order || !payment) return null;
  const { escrow } = financeOf(payment);
  if (await hasOpenComplaint(order._id)) {
    return freezeIfComplaint(order._id);
  }
  if (order.status !== 'CUSTOMER_ACCEPTED' || !escrow.remainingSettled) return escrow;
  if (escrow.status !== ESCROW_STATUS.HELD) return escrow;
  const pending = markReleasePending(escrow);
  if (!pending.ok) return escrow;
  pending.escrow.remainingSettled = true;
  pending.escrow.remainingSettledAt = escrow.remainingSettledAt;
  pending.escrow.remainingSettledBy = escrow.remainingSettledBy;
  await applyChange(payment, escrow.status, pending.escrow, {
    ledger: {
      type: LEDGER_TYPE.RELEASE_PENDING,
      amount: 0,
      key: `release-pending:${payment.pgId || payment._id}`,
      note: 'Eligible for mock payout pending admin settlement',
    },
  });
  return pending.escrow;
}

async function settle(orderId, user) {
  requireAdmin(user);
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  const payment = await Payment.findOne({ orderId: order._id, type: PAYMENT_TYPE.DEPOSIT });
  if (!payment) throw new ApiError(409, 'This order has no deposit escrow');
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw new ApiError(409, 'Deposit must be paid before payout');
  }
  if (await hasOpenComplaint(order._id)) {
    await freezeIfComplaint(order._id);
    throw new ApiError(409, 'Escrow is frozen while a complaint is open');
  }

  return runInTransaction(async (tx) => {
    await escrowStore.lockByPayment(payment, tx);
    if (await hasOpenComplaint(order._id)) {
      throw new ApiError(409, 'Escrow is frozen while a complaint is open');
    }
    const live = await Payment.findById(payment._id);
    const { finance, escrow } = financeOf(live);
    const gate = canReleaseEscrow({
      escrow,
      customerAccepted: order.status === 'CUSTOMER_ACCEPTED',
      remainingSettled: Boolean(escrow.remainingSettled),
      openComplaint: false,
      depositPaid: live.status === PAYMENT_STATUS.PAID,
    });
    if (!gate.ok) throw new ApiError(409, 'Escrow is not ready to release', { code: gate.code });

    let current = escrow;
    if (current.status === ESCROW_STATUS.HELD || current.status === ESCROW_STATUS.FROZEN) {
      const pending = markReleasePending(current);
      if (!pending.ok) throw new ApiError(409, 'Payout refused', { code: pending.code });
      pending.escrow.remainingSettled = current.remainingSettled;
      pending.escrow.remainingSettledAt = current.remainingSettledAt;
      pending.escrow.remainingSettledBy = current.remainingSettledBy;
      await applyChange(live, current.status, pending.escrow, {
        ledger: {
          type: LEDGER_TYPE.RELEASE_PENDING,
          amount: 0,
          key: `release-pending:${live.pgId || live._id}`,
          note: 'Admin mock payout authorized',
        },
      });
      current = pending.escrow;
    }

    const released = releaseEscrow(current);
    if (!released.ok) throw new ApiError(409, 'Payout refused', { code: released.code });
    await applyChange(live, current.status, released.escrow, {
      ledger: {
        type: LEDGER_TYPE.PAYOUT,
        amount: finance.contractorHold,
        key: `payout:${live.pgId || live._id}`,
        note: 'Mock contractor hold 10% released',
      },
    });
    const payoutAmount = released.escrow.payoutAmount || finance.contractorHold;
    if (payoutAmount > 0) {
      const payout = await escrowStore.insertPayout(
        live,
        released.escrow,
        `MOCK-PAYOUT-${live.pgId || live._id}`,
        tx
      );
      if ((await escrowStore.tablesReady(tx)) && !payout.created) {
        throw new ApiError(409, 'Payout already recorded', { code: 'PAYOUT_ALREADY_PAID' });
      }
    }
    const existing = await Commission.findOne({ paymentId: live._id });
    if (!existing) {
      await Commission.create({
        paymentId: live._id,
        orderId: order._id,
        contractorId: order.contractorId,
        rateSnapshot: finance.platformFeeRate * 100,
        platformAmount: finance.platformFee,
        contractorAmount: finance.contractorHold,
        status: COMMISSION_STATUS.POSTED,
      }, tx);
    }
    await writeAudit({
      actorId: user.id,
      actorRole: 'ADMIN',
      action: AUDIT_ACTION.COMMISSION_CREATED,
      entityType: 'Payment',
      entityId: live._id,
      meta: { mockPayout: true, platformFee: finance.platformFee, contractorHold: finance.contractorHold },
    });
    return { order: order.toPublic(), payment: live.toPublic(), mock: true };
  });
}

async function refundDeposit(orderId, actorId, reason, cancelCase = CANCEL_CASE.CONTRACTOR_CANCEL, amount = null) {
  const payment = await Payment.findOne({ orderId, type: PAYMENT_TYPE.DEPOSIT });
  if (!payment) throw new ApiError(409, 'This order has no deposit escrow');
  if (payment.status !== PAYMENT_STATUS.PAID) throw new ApiError(409, 'Only a paid deposit can be refunded');
  const { finance } = financeOf(payment);
  const refundAmount = amount == null ? finance.depositAmount : amount;

  await runInTransaction(async (tx) => {
    await escrowStore.lockByPayment(payment, tx);
    const live = await Payment.findById(payment._id);
    let { escrow } = financeOf(live);
    if (escrow.status !== ESCROW_STATUS.REFUND_PENDING) {
      const pending = markRefundPending(escrow, refundAmount);
      if (!pending.ok) throw new ApiError(409, 'Refund refused', { code: pending.code });
      pending.escrow.cancelCase = cancelCase;
      pending.escrow.cancelReason = reason || 'Policy refund';
      await applyChange(live, escrow.status, pending.escrow, {
        ledger: {
          type: LEDGER_TYPE.REFUND_PENDING,
          amount: refundAmount,
          key: `refund-pending:${live.pgId || live._id}`,
          note: reason || 'Mock refund authorized',
        },
      });
      escrow = pending.escrow;
    }
    const next = refundEscrow(escrow, { fullDeposit: false, amount: refundAmount });
    if (!next.ok) throw new ApiError(409, 'Refund refused', { code: next.code });
    next.escrow.cancelCase = cancelCase;
    next.escrow.cancelReason = reason || 'Policy refund';
    const refundedAt = new Date();
    await applyChange(live, escrow.status, next.escrow, {
      ledger: {
        type: LEDGER_TYPE.REFUND,
        amount: refundAmount,
        key: `refund:${live.pgId || live._id}`,
        note: reason || 'Mock deposit refund',
      },
      paymentPatch: { status: PAYMENT_STATUS.REFUNDED, refundedAt },
    });
    await escrowStore.insertRefund(live, next.escrow, {
      amount: refundAmount,
      reason: reason || 'Mock deposit refund',
      cancelCase,
      key: `refund-row:${live.pgId || live._id}`,
    }, tx);
    const commissionService = require('./commissionService');
    await commissionService.reverseForPayment(live._id, tx);
    payment.status = PAYMENT_STATUS.REFUNDED;
    payment.refundedAt = refundedAt;
    payment.metadata = live.metadata;
  });
  await writeAudit({
    actorId,
    actorRole: 'SYSTEM',
    action: AUDIT_ACTION.PAYMENT_REFUNDED,
    entityType: 'Payment',
    entityId: payment._id,
    meta: { mockRefund: true, reason, cancelCase },
  });
  return payment;
}

async function holdAfterCustomerCancel(orderId, user, reason) {
  const payment = await Payment.findOne({ orderId, type: PAYMENT_TYPE.DEPOSIT });
  if (!payment) return null;
  if (payment.status !== PAYMENT_STATUS.PAID) {
    const { finance, escrow } = financeOf(payment);
    const closed = cancelWithoutFunding(escrow);
    await applyChange(payment, escrow.status, closed.escrow, {
      ledger: {
        type: LEDGER_TYPE.CANCEL,
        amount: 0,
        key: `cancel-unpaid:${payment.pgId || payment._id}`,
        note: reason || 'Cancelled before deposit',
      },
    });
    await escrowStore.insertCancellation(payment, CANCEL_CASE.UNPAID, reason || 'Cancelled before deposit');
    return closed.escrow;
  }
  const { escrow } = financeOf(payment);
  const frozen = holdCustomerCancel(escrow, reason);
  if (!frozen.ok) throw new ApiError(409, 'Escrow cannot be frozen for cancellation', { code: frozen.code });
  await applyChange(payment, escrow.status, frozen.escrow, {
    ledger: {
      type: LEDGER_TYPE.FREEZE,
      amount: 0,
      key: `cancel-customer:${payment.pgId || payment._id}`,
      note: reason || 'Customer cancelled after deposit; awaiting admin allocation',
    },
  });
  await escrowStore.insertCancellation(payment, CANCEL_CASE.CUSTOMER_AFTER_DEPOSIT, reason || 'Customer cancelled after deposit');
  return frozen.escrow;
}

async function adminRefund(orderId, user, reason, cancelCase = CANCEL_CASE.MUTUAL, amount = null) {
  requireAdmin(user);
  const payment = await refundDeposit(orderId, user.id, reason || 'Admin mock refund', cancelCase, amount);
  return {
    payment: payment.toPublic ? payment.toPublic() : payment,
    mock: true,
  };
}

module.exports = {
  financeOf,
  hasOpenComplaint,
  ensureEscrowRow,
  markDepositHeld,
  freezeIfComplaint,
  confirmRemaining,
  maybeMarkReleasePending,
  settle,
  refundDeposit,
  holdAfterCustomerCancel,
  adminRefund,
};
