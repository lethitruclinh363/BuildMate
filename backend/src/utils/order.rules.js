const crypto = require('crypto');

const ORDER_STATUS = Object.freeze({
  REQUEST_CREATED: 'REQUEST_CREATED',
  QUOTATION_SENT: 'QUOTATION_SENT',
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  DEPOSIT_PAID: 'DEPOSIT_PAID',
  STARTED: 'STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CUSTOMER_ACCEPTED: 'CUSTOMER_ACCEPTED',
  CANCELLED: 'CANCELLED',
});

const REPAIR_JOB_STATUS = ORDER_STATUS;

const PROGRESS_STATUS = Object.freeze({
  STARTED: 'STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
});

const STATUS_RANK = Object.freeze({
  [ORDER_STATUS.REQUEST_CREATED]: 1,
  [ORDER_STATUS.QUOTATION_SENT]: 2,
  [ORDER_STATUS.QUOTATION_ACCEPTED]: 3,
  [ORDER_STATUS.DEPOSIT_PAID]: 4,
  [ORDER_STATUS.STARTED]: 5,
  [ORDER_STATUS.IN_PROGRESS]: 6,
  [ORDER_STATUS.COMPLETED]: 7,
  [ORDER_STATUS.CUSTOMER_ACCEPTED]: 8,
  [ORDER_STATUS.CANCELLED]: 0,
});

const OPEN_ORDER_STATUSES = [
  ORDER_STATUS.QUOTATION_ACCEPTED,
  ORDER_STATUS.DEPOSIT_PAID,
  ORDER_STATUS.STARTED,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.COMPLETED,
];

const CANCELLABLE_ORDER_STATUSES = [
  ORDER_STATUS.QUOTATION_ACCEPTED,
  ORDER_STATUS.DEPOSIT_PAID,
];

/** One-way progress writes: only the next stage, never a repeat or a step back. */
const PROGRESS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.QUOTATION_ACCEPTED]: Object.freeze([]),
  [ORDER_STATUS.DEPOSIT_PAID]: Object.freeze([PROGRESS_STATUS.STARTED]),
  [ORDER_STATUS.STARTED]: Object.freeze([PROGRESS_STATUS.IN_PROGRESS]),
  [ORDER_STATUS.IN_PROGRESS]: Object.freeze([PROGRESS_STATUS.COMPLETED]),
});

function generateOrderCode() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BM-${day}-${rand}`;
}

function orderStatusAfterProgress(currentStatus, progressStatus) {
  if (
    currentStatus === ORDER_STATUS.CUSTOMER_ACCEPTED ||
    currentStatus === ORDER_STATUS.CANCELLED
  ) {
    return currentStatus;
  }
  if (progressStatus === PROGRESS_STATUS.COMPLETED) {
    if (
      currentStatus === ORDER_STATUS.IN_PROGRESS ||
      currentStatus === ORDER_STATUS.COMPLETED
    ) {
      return ORDER_STATUS.COMPLETED;
    }
    return currentStatus;
  }
  const rank = STATUS_RANK[currentStatus] || 0;
  if (progressStatus === PROGRESS_STATUS.STARTED && rank > 0 && rank < STATUS_RANK[ORDER_STATUS.STARTED]) {
    return ORDER_STATUS.STARTED;
  }
  if (
    progressStatus === PROGRESS_STATUS.IN_PROGRESS &&
    rank > 0 &&
    rank < STATUS_RANK[ORDER_STATUS.IN_PROGRESS]
  ) {
    return ORDER_STATUS.IN_PROGRESS;
  }
  return currentStatus;
}

function isValidProgressTransition(currentStatus, nextStatus) {
  const allowed = PROGRESS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) return false;
  const currentRank = STATUS_RANK[currentStatus] || 0;
  const nextRank = STATUS_RANK[nextStatus] || 0;
  if (nextRank && currentRank && nextRank <= currentRank) return false;
  return true;
}

function orderStatusAfterDeposit(currentStatus) {
  const rank = STATUS_RANK[currentStatus] || 0;
  if (rank > 0 && rank < STATUS_RANK[ORDER_STATUS.DEPOSIT_PAID]) {
    return ORDER_STATUS.DEPOSIT_PAID;
  }
  return currentStatus;
}

module.exports = {
  ORDER_STATUS,
  REPAIR_JOB_STATUS,
  PROGRESS_STATUS,
  STATUS_RANK,
  OPEN_ORDER_STATUSES,
  CANCELLABLE_ORDER_STATUSES,
  generateOrderCode,
  isValidProgressTransition,
  orderStatusAfterProgress,
  orderStatusAfterDeposit,
};
