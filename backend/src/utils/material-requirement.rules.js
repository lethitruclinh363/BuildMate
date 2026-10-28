const MRL_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  QUOTED: 'QUOTED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
});

const MATERIAL_QUOTE_STATUS = Object.freeze({
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
});

const ACTIVE_LIST_STATUSES = [MRL_STATUS.DRAFT, MRL_STATUS.SENT, MRL_STATUS.QUOTED, MRL_STATUS.CONFIRMED];

function canEditItems(status) {
  return status === MRL_STATUS.DRAFT;
}

function canSend(status, itemCount) {
  return status === MRL_STATUS.DRAFT && Number(itemCount) > 0;
}

function canCancel(status) {
  return status === MRL_STATUS.DRAFT || status === MRL_STATUS.SENT;
}

function canQuote(status) {
  return status === MRL_STATUS.SENT;
}

function canConfirmQuote(listStatus, quoteStatus) {
  return listStatus === MRL_STATUS.QUOTED && quoteStatus === MATERIAL_QUOTE_STATUS.SENT;
}

function nextAfterSend() {
  return MRL_STATUS.SENT;
}

function nextAfterQuote() {
  return MRL_STATUS.QUOTED;
}

function nextAfterConfirm() {
  return MRL_STATUS.CONFIRMED;
}

function normalizeItem(input = {}) {
  const name = String(input.name || '').trim();
  const specification = String(input.specification || '').trim();
  const unit = String(input.unit || '').trim();
  const notes = String(input.notes || '').trim();
  const quantity = Number(input.quantity);
  return {
    name,
    specification,
    unit,
    notes,
    quantity: Number.isFinite(quantity) ? quantity : NaN,
  };
}

function assertItem(input) {
  const item = normalizeItem(input);
  if (item.name.length < 2 || item.name.length > 140) {
    const error = new Error('Item name is invalid');
    error.statusCode = 422;
    throw error;
  }
  if (item.specification.length > 200) {
    const error = new Error('Specification is too long');
    error.statusCode = 422;
    throw error;
  }
  if (item.unit.length > 40) {
    const error = new Error('Unit is too long');
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1000000) {
    const error = new Error('Quantity must be greater than 0');
    error.statusCode = 422;
    throw error;
  }
  if (item.notes.length > 500) {
    const error = new Error('Notes are too long');
    error.statusCode = 422;
    throw error;
  }
  return item;
}

function quoteTotal(items = [], deliveryFee = 0) {
  const lines = (items || []).reduce((sum, row) => {
    const qty = Number(row.quantity);
    const price = Math.round(Number(row.unitPrice) || 0);
    if (!Number.isFinite(qty) || qty < 0) return sum;
    return sum + qty * price;
  }, 0);
  const fee = Math.round(Number(deliveryFee) || 0);
  return Math.round(lines + fee);
}

module.exports = {
  MRL_STATUS,
  MATERIAL_QUOTE_STATUS,
  ACTIVE_LIST_STATUSES,
  canEditItems,
  canSend,
  canCancel,
  canQuote,
  canConfirmQuote,
  nextAfterSend,
  nextAfterQuote,
  nextAfterConfirm,
  normalizeItem,
  assertItem,
  quoteTotal,
};
