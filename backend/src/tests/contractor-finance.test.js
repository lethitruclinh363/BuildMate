const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  snapshotContractorQuote,
  defaultEscrowRecord,
  applyDepositCaptured,
  freezeEscrow,
  canStartWork,
  canReleaseEscrow,
  canTransition,
  releaseEscrow,
  refundEscrow,
  cancelWithoutFunding,
  holdCustomerCancel,
  markReleasePending,
  snapshotMaterialFree,
  isLegacyMaterialOrder,
  assertDepositTermsAccepted,
  recordDepositTerms,
  identitiesHold,
  availableBalance,
  ESCROW_STATUS,
  PAYOUT_STATUS,
  CANCEL_CASE,
} = require('../utils/contractor-finance');

describe('contractor finance snapshot (TC02-TC04, TC16)', () => {
  it('splits 10_000_000 into 15% deposit, 10% fee, 5% hold, 85% remaining', () => {
    const snap = snapshotContractorQuote(10_000_000);
    assert.equal(snap.ok, true);
    assert.equal(snap.depositAmount, 1_500_000);
    assert.equal(snap.platformFee, 1_000_000);
    assert.equal(snap.contractorHold, 500_000);
    assert.equal(snap.remainingAmount, 8_500_000);
    assert.equal(snap.contractorTotalEarning, 9_000_000);
    assert.equal(snap.depositAmount + snap.remainingAmount, snap.totalAmount);
    assert.equal(snap.platformFee + snap.contractorHold, snap.depositAmount);
  });

  it('does not treat remaining 85% as platform revenue', () => {
    const snap = snapshotContractorQuote(10_000_000);
    assert.equal(snap.platformFee, 1_000_000);
    assert.notEqual(snap.platformFee, snap.remainingAmount);
  });

  it('keeps 15/5/10/85 identities on odd VND totals', () => {
    for (const total of [1, 7, 333, 1_234_567, 99]) {
      const snap = snapshotContractorQuote(total);
      assert.equal(snap.ok, identitiesHold(snap));
      assert.equal(snap.ok, true);
      assert.equal(snap.depositAmount, snap.platformFee + snap.contractorHold);
      assert.equal(snap.totalAmount, snap.depositAmount + snap.remainingAmount);
      assert.equal(snap.contractorTotalEarning, snap.remainingAmount + snap.contractorHold);
    }
  });
});

describe('escrow state machine (TC05-TC15)', () => {
  function funded() {
    const snap = snapshotContractorQuote(10_000_000);
    const captured = applyDepositCaptured(defaultEscrowRecord(snap));
    return captured.escrow;
  }

  it('blocks work until deposit is held', () => {
    assert.equal(canStartWork('QUOTATION_ACCEPTED', ESCROW_STATUS.NOT_FUNDED), false);
    assert.equal(canStartWork('DEPOSIT_PAID', ESCROW_STATUS.HELD), true);
  });

  it('does not payout before customer acceptance and remaining settlement', () => {
    const escrow = funded();
    assert.equal(canReleaseEscrow({ escrow, customerAccepted: true, remainingSettled: false, openComplaint: false }).ok, false);
    assert.equal(canReleaseEscrow({ escrow, customerAccepted: false, remainingSettled: true, openComplaint: false }).ok, false);
  });

  it('releases 5% once and refuses a second payout', () => {
    const escrow = funded();
    const first = releaseEscrow(escrow);
    assert.equal(first.ok, true);
    assert.equal(first.escrow.payoutAmount, 500_000);
    assert.equal(first.escrow.payoutStatus, PAYOUT_STATUS.PAID);
    const second = releaseEscrow(first.escrow);
    assert.equal(second.ok, false);
    assert.equal(second.code, 'PAYOUT_ALREADY_PAID');
  });

  it('refunds the 15% deposit once and refuses a second refund', () => {
    const escrow = funded();
    const first = refundEscrow(escrow, { fullDeposit: true });
    assert.equal(first.ok, true);
    assert.equal(first.escrow.refundedAmount, 1_500_000);
    const second = refundEscrow(first.escrow, { fullDeposit: true });
    assert.equal(second.ok, false);
  });

  it('freezes escrow so release is blocked during a dispute', () => {
    const frozen = freezeEscrow(funded());
    assert.equal(frozen.escrow.status, ESCROW_STATUS.FROZEN);
    const gate = canReleaseEscrow({
      escrow: frozen.escrow,
      customerAccepted: true,
      remainingSettled: true,
      openComplaint: true,
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.code, 'ESCROW_FROZEN_BY_COMPLAINT');
  });

  it('allows settle after a dispute freeze once the complaint is closed and other gates pass', () => {
    const frozen = freezeEscrow(funded());
    assert.equal(frozen.escrow.cancelCase, CANCEL_CASE.DISPUTE);
    const stillShort = canReleaseEscrow({
      escrow: frozen.escrow,
      customerAccepted: true,
      remainingSettled: false,
      openComplaint: false,
    });
    assert.equal(stillShort.ok, false);
    const gate = canReleaseEscrow({
      escrow: frozen.escrow,
      customerAccepted: true,
      remainingSettled: true,
      openComplaint: false,
    });
    assert.equal(gate.ok, true);
    const pending = markReleasePending(frozen.escrow);
    assert.equal(pending.ok, true);
    assert.equal(pending.escrow.status, ESCROW_STATUS.RELEASE_PENDING);
  });

  it('does not payout before customer acceptance even when remaining is marked settled', () => {
    const escrow = funded();
    escrow.remainingSettled = true;
    assert.equal(canReleaseEscrow({
      escrow,
      customerAccepted: false,
      remainingSettled: true,
      openComplaint: false,
    }).ok, false);
  });

  it('requires remaining 85% reconciliation before payout', () => {
    const escrow = funded();
    const gate = canReleaseEscrow({
      escrow,
      customerAccepted: true,
      remainingSettled: false,
      openComplaint: false,
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.code, 'REMAINING_SETTLEMENT_REQUIRED');
  });

  it('blocks illegal transitions including a second refund after release', () => {
    assert.equal(canTransition(ESCROW_STATUS.RELEASED, ESCROW_STATUS.REFUNDED).ok, false);
    assert.equal(canTransition(ESCROW_STATUS.NOT_FUNDED, ESCROW_STATUS.RELEASED).ok, false);
    assert.equal(canTransition(ESCROW_STATUS.HELD, ESCROW_STATUS.RELEASE_PENDING).ok, true);
  });
});

describe('contractor cancel policies', () => {
  function funded() {
    return applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow;
  }

  it('A: unpaid cancel closes escrow with no money movement', () => {
    const closed = cancelWithoutFunding(defaultEscrowRecord(snapshotContractorQuote(10_000_000)));
    assert.equal(closed.ok, true);
    assert.equal(closed.escrow.status, ESCROW_STATUS.CANCELLED_SETTLED);
    assert.equal(closed.escrow.cancelCase, CANCEL_CASE.UNPAID);
    assert.equal(closed.escrow.releasedAmount, 0);
    assert.equal(closed.escrow.refundedAmount, 0);
  });

  it('B: customer cancel after deposit freezes funds and does not auto-payout', () => {
    const frozen = holdCustomerCancel(funded(), 'Customer cancelled');
    assert.equal(frozen.ok, true);
    assert.equal(frozen.escrow.status, ESCROW_STATUS.FROZEN);
    assert.equal(frozen.escrow.cancelCase, CANCEL_CASE.CUSTOMER_AFTER_DEPOSIT);
    assert.equal(canReleaseEscrow({
      escrow: frozen.escrow,
      customerAccepted: true,
      remainingSettled: true,
      openComplaint: false,
    }).ok, false);
  });

  it('C: contractor cancel refunds the full 15% once', () => {
    const first = refundEscrow(funded(), { fullDeposit: true });
    assert.equal(first.ok, true);
    assert.equal(first.escrow.refundedAmount, 1_500_000);
    assert.equal(first.escrow.status, ESCROW_STATUS.REFUNDED);
    assert.equal(refundEscrow(first.escrow, { fullDeposit: true }).ok, false);
  });

  it('D: mutual refund cannot exceed the held balance', () => {
    const over = refundEscrow(funded(), { fullDeposit: false, amount: 2_000_000 });
    assert.equal(over.ok, false);
    const ok = refundEscrow(funded(), { fullDeposit: false, amount: 1_500_000 });
    assert.equal(ok.ok, true);
    assert.equal(ok.escrow.refundedAmount, 1_500_000);
  });

  it('E: dispute freeze blocks payout until admin acts', () => {
    const frozen = freezeEscrow(funded());
    assert.equal(frozen.escrow.status, ESCROW_STATUS.FROZEN);
    assert.equal(releaseEscrow(frozen.escrow).ok, false);
  });
});

describe('material free policy (TC18-TC22, TC30)', () => {
  it('prices goods plus shipping with zero platform fee and zero deposit', () => {
    const priced = snapshotMaterialFree({ materialSubtotal: 9_000_000, shippingFee: 1_000_000 });
    assert.equal(priced.totalAmount, 10_000_000);
    assert.equal(priced.platformFeeAmount, 0);
    assert.equal(priced.depositAmount, 0);
    assert.equal(priced.remainingAmount, 10_000_000);
    assert.equal(priced.paymentMethod, 'COD');
  });

  it('does not treat 2_100_000 material GMV as platform revenue', () => {
    const priced = snapshotMaterialFree({ materialSubtotal: 2_000_000, shippingFee: 100_000 });
    assert.equal(priced.ok, true);
    assert.equal(priced.totalAmount, 2_100_000);
    assert.equal(priced.platformFeeAmount, 0);
  });

  it('keeps legacy deposit orders identifiable', () => {
    assert.equal(isLegacyMaterialOrder({ depositRateSnapshot: 15, depositAmount: 40500 }), true);
    assert.equal(isLegacyMaterialOrder({ depositRateSnapshot: 0, depositAmount: 0 }), false);
  });
});

describe('escrow balance (TC13-TC15)', () => {
  it('does not allow payout and refund to consume more than the deposit', () => {
    const snap = snapshotContractorQuote(10_000_000);
    const held = applyDepositCaptured(defaultEscrowRecord(snap)).escrow;
    const paidOut = releaseEscrow(held);
    assert.equal(paidOut.ok, true);
    const refundAfterPayout = refundEscrow(paidOut.escrow, { fullDeposit: true });
    assert.equal(refundAfterPayout.ok, false);
    assert.equal(availableBalance(paidOut.escrow), 1_000_000);
  });

  it('blocks a concurrent-style refund+payout double spend in sequence', () => {
    const held = applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow;
    const refunded = refundEscrow(held, { fullDeposit: true });
    assert.equal(refunded.ok, true);
    const payoutAfterRefund = releaseEscrow(refunded.escrow);
    assert.equal(payoutAfterRefund.ok, false);
    assert.equal(availableBalance(refunded.escrow), 0);
  });

  it('release-pending still cannot overdraw the hold', () => {
    const held = applyDepositCaptured(defaultEscrowRecord(snapshotContractorQuote(10_000_000))).escrow;
    const pending = markReleasePending(held);
    assert.equal(pending.ok, true);
    const first = releaseEscrow(pending.escrow);
    assert.equal(first.ok, true);
    assert.equal(first.escrow.payoutAmount, 500_000);
    assert.equal(releaseEscrow(first.escrow).code, 'PAYOUT_ALREADY_PAID');
  });
});

describe('deposit terms and admin ledger', () => {
  it('refuses checkout without a matching terms acceptance', () => {
    assert.equal(assertDepositTermsAccepted({}).ok, false);
    assert.equal(assertDepositTermsAccepted({ termsAcceptance: { accepted: true, version: 'OLD' } }).ok, false);
    const meta = { termsAcceptance: recordDepositTerms({ userId: 'c1' }) };
    assert.equal(assertDepositTermsAccepted(meta).ok, true);
  });

  it('splits admin KPIs so deposit is not treated as platform revenue', () => {
    const { emptyLedger, addDepositRow } = require('../utils/admin-finance-ledger');
    const snap = snapshotContractorQuote(10_000_000);
    const held = applyDepositCaptured(defaultEscrowRecord(snap)).escrow;
    const ledger = addDepositRow(emptyLedger(), { finance: snap, escrow: held, paymentStatus: 'PAID' });
    assert.equal(ledger.acceptedQuoteTotal, 10_000_000);
    assert.equal(ledger.capturedDeposit, 1_500_000);
    assert.equal(ledger.heldAmount, 1_500_000);
    assert.notEqual(ledger.capturedDeposit, ledger.platformFeePosted);
    assert.equal(ledger.materialGmv, 0);
  });
});

describe('finance access guards', () => {
  it('order and payment services refuse other users before returning escrow', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const orderSrc = fs.readFileSync(path.join(__dirname, '../services/orderService.js'), 'utf8');
    const paySrc = fs.readFileSync(path.join(__dirname, '../services/paymentService.js'), 'utf8');
    const settleSrc = fs.readFileSync(path.join(__dirname, '../services/escrowService.js'), 'utf8');
    const routeSrc = fs.readFileSync(path.join(__dirname, '../routes/orderRoutes.js'), 'utf8');
    assert.match(orderSrc, /assertParty/);
    assert.match(paySrc, /You cannot view these payments/);
    assert.match(settleSrc, /Only an admin can settle or refund contractor escrow/);
    assert.match(routeSrc, /settle-escrow', allowRole\('ADMIN'\)/);
  });
});

describe('material deposit API guard (TC22)', () => {
  it('removes the discontinued material-deposit checkout helper', () => {
    const rulesPath = path.join(__dirname, '../utils/material-deposit.rules.js');
    assert.equal(fs.existsSync(rulesPath), false);
    assert.equal(isLegacyMaterialOrder({ depositRateSnapshot: 0, depositAmount: 0 }), false);
    assert.equal(isLegacyMaterialOrder({ depositRateSnapshot: 15, depositAmount: 40500 }), true);
  });
});
