const { normalizeMrlUnit } = require('./material-requirement.rules');

const MRL_CHAT_MARKER = '[[BM:MRL]]';

function encodeMrlChat(payload, preview) {
  const body = JSON.stringify(payload || {});
  const head = `${MRL_CHAT_MARKER}${String(preview || 'Material list').slice(0, 120)}`;
  return `${head}\n${body}`.slice(0, 4000);
}

function parseLooseMrlChat(content) {
  const raw = String(content || '');
  const match = raw.match(/Material list\s+([a-f0-9]{24})\b/i);
  if (!match) return null;
  const rest = raw.slice(match.index + match[0].length);
  const items = rest
    .split(/\s[-–—]\s/)
    .map((part) => part.replace(/^[\s:-]+/, '').trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split('|').map((item) => item.trim()).filter(Boolean);
      const name = pieces[0] || part;
      const qtyUnit = pieces[1] || '';
      const qtyMatch = qtyUnit.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
      return {
        name,
        quantity: qtyMatch ? Number(qtyMatch[1].replace(',', '.')) : 0,
        unit: normalizeMrlUnit(qtyMatch ? qtyMatch[2] : ''),
        specification: pieces[2] || '',
        notes: '',
      };
    });
  return {
    v: 1,
    kind: 'MRL_REQUEST',
    listId: match[1],
    items,
    legacy: true,
  };
}

function parseMrlChat(content) {
  const raw = String(content || '');
  if (raw.startsWith(MRL_CHAT_MARKER)) {
    const start = raw.indexOf('{');
    if (start >= 0) {
      try {
        const payload = JSON.parse(raw.slice(start));
        if (payload && payload.kind && payload.listId) return payload;
      } catch {
        /* fall through to loose text */
      }
    }
  }
  return parseLooseMrlChat(raw);
}

function requestPayload(list) {
  return {
    v: 1,
    kind: 'MRL_REQUEST',
    listId: list.id,
    requestCode: list.requestCode || '',
    requestId: list.requestId || '',
    title: list.title || list.requestTitle || '',
    address: list.siteAddress || '',
    storeName: list.storeName || '',
    status: list.status || 'SENT',
    customerName: list.customerName || '',
    items: (list.items || []).map((item) => ({
      name: item.name,
      specification: item.specification || '',
      unit: normalizeMrlUnit(item.unit),
      quantity: Number(item.quantity) || 0,
      notes: item.notes || '',
    })),
  };
}

function quotePayload(list, quote, total) {
  return {
    v: 1,
    kind: 'MRL_QUOTE',
    listId: list.id,
    requestCode: list.requestCode || '',
    requestId: list.requestId || '',
    title: list.requestTitle || '',
    address: list.siteAddress || '',
    storeName: list.storeName || '',
    deliveryFee: Number(quote?.deliveryFee || 0),
    note: quote?.note || '',
    total: Number(total) || 0,
    items: (quote?.items || []).map((item) => ({
      name: item.name,
      unit: normalizeMrlUnit(item.unit),
      quantity: Number(item.availableQty != null ? item.availableQty : item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
    })),
  };
}

function confirmedPayload(list) {
  return {
    v: 1,
    kind: 'MRL_CONFIRMED',
    listId: list.id,
    requestCode: list.requestCode || '',
    requestId: list.requestId || '',
    storeName: list.storeName || '',
    status: list.status || 'CONFIRMED',
  };
}

function rejectedPayload(list) {
  return {
    v: 1,
    kind: 'MRL_REJECTED',
    listId: list.id,
    requestCode: list.requestCode || '',
    requestId: list.requestId || '',
    storeName: list.storeName || '',
    status: list.status || 'SENT',
  };
}

function progressPayload(list) {
  return {
    v: 1,
    kind: 'MRL_PROGRESS',
    listId: list.id,
    requestCode: list.requestCode || '',
    requestId: list.requestId || '',
    storeName: list.storeName || '',
    status: list.status || '',
  };
}

module.exports = {
  MRL_CHAT_MARKER,
  encodeMrlChat,
  parseMrlChat,
  parseLooseMrlChat,
  requestPayload,
  quotePayload,
  confirmedPayload,
  rejectedPayload,
  progressPayload,
};
