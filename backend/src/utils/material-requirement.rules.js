const MRL_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  QUOTED: 'QUOTED',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
});

const MATERIAL_QUOTE_STATUS = Object.freeze({
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
});

const ACTIVE_LIST_STATUSES = [
  MRL_STATUS.DRAFT,
  MRL_STATUS.SENT,
  MRL_STATUS.QUOTED,
  MRL_STATUS.CONFIRMED,
  MRL_STATUS.PREPARING,
  MRL_STATUS.DELIVERING,
  MRL_STATUS.DELIVERED,
];

const FULFILLMENT_NEXT = Object.freeze({
  [MRL_STATUS.CONFIRMED]: MRL_STATUS.PREPARING,
  [MRL_STATUS.PREPARING]: MRL_STATUS.DELIVERING,
  [MRL_STATUS.DELIVERING]: MRL_STATUS.DELIVERED,
});

const STORE_INBOX_STATUSES = [
  MRL_STATUS.SENT,
  MRL_STATUS.QUOTED,
  MRL_STATUS.CONFIRMED,
  MRL_STATUS.PREPARING,
  MRL_STATUS.DELIVERING,
  MRL_STATUS.DELIVERED,
];

function canEditItems(status) {
  return status === MRL_STATUS.DRAFT;
}

function canSend(status, itemCount) {
  return status === MRL_STATUS.DRAFT && Number(itemCount) > 0;
}

function canCancel(status) {
  return status === MRL_STATUS.DRAFT || status === MRL_STATUS.SENT || status === MRL_STATUS.CONFIRMED;
}

function nextFulfillment(status) {
  return FULFILLMENT_NEXT[status] || null;
}

function canAdvanceFulfillment(fromStatus, toStatus) {
  return nextFulfillment(fromStatus) === toStatus;
}

function isFulfillmentStatus(status) {
  return Boolean(FULFILLMENT_NEXT[status]) || status === MRL_STATUS.DELIVERED;
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

function normalizeMrlUnit(value) {
  const unit = String(value || '').trim();
  const matched = unit.match(/^(\d+(?:[.,]\d+)?)\s+([^\d\s].*)$/);
  if (!matched) return unit;
  return matched[2].trim();
}

function unitLooksLikeQuantity(value) {
  return /^\d+(?:[.,]\d+)?\s+[^\d\s]/.test(String(value || '').trim());
}

function formatMrlQuantity(value) {
  if (value == null || value === '') return '';
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return '';
  return String(quantity);
}

function formatQtyWithUnit(quantity, unit) {
  const qty = formatMrlQuantity(quantity);
  if (!qty) return '';
  const cleanUnit = normalizeMrlUnit(unit);
  return cleanUnit ? `${qty} ${cleanUnit}` : qty;
}

function formatMrlSpec(value) {
  return String(value || '').trim();
}

function mrlIndex(index) {
  return String(Number(index) + 1).padStart(2, '0');
}

function normalizeItem(input = {}) {
  const name = String(input.name || '').trim();
  const specification = String(input.specification || '').trim();
  const unit = normalizeMrlUnit(input.unit);
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

function assertContractorItem(input) {
  const item = assertItem(input);
  if (!item.unit) {
    const error = new Error('Unit is required');
    error.statusCode = 422;
    throw error;
  }
  return item;
}

function quoteTotal(items = [], deliveryFee = 0) {
  const lines = (items || []).reduce((sum, row) => {
    const qty = Number(row.availableQty != null ? row.availableQty : row.quantity);
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
  FULFILLMENT_NEXT,
  STORE_INBOX_STATUSES,
  canEditItems,
  canSend,
  canCancel,
  canQuote,
  canConfirmQuote,
  nextFulfillment,
  canAdvanceFulfillment,
  isFulfillmentStatus,
  nextAfterSend,
  nextAfterQuote,
  nextAfterConfirm,
  normalizeMrlUnit,
  unitLooksLikeQuantity,
  formatMrlQuantity,
  formatQtyWithUnit,
  formatMrlSpec,
  mrlIndex,
  normalizeItem,
  assertItem,
  assertContractorItem,
  quoteTotal,
};
