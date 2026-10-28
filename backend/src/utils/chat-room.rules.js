const ROOM_KIND = Object.freeze({
  CUSTOMER_CONTRACTOR: 'CUSTOMER_CONTRACTOR',
  CUSTOMER_MATERIAL_STORE: 'CUSTOMER_MATERIAL_STORE',
});

const STORE_CHAT_TYPES = new Set(['MATERIALS', 'BOTH']);

function isStoreChat(kind) {
  return kind === ROOM_KIND.CUSTOMER_MATERIAL_STORE;
}

function canCreateStoreRoom({ status, storeType, ownerBlocked } = {}) {
  if (ownerBlocked) return false;
  if (status !== 'LIVE') return false;
  return STORE_CHAT_TYPES.has(storeType);
}

function canSendInStoreRoom({ accountStatus, storeStatus } = {}) {
  if (accountStatus === 'BLOCKED' || accountStatus === 'BANNED') return false;
  if (storeStatus === 'BLOCKED' || storeStatus === 'BANNED') return false;
  return true;
}

function quotationAllowed(kind) {
  return !isStoreChat(kind);
}

function chatPathForRole(role, roomId) {
  if (role === 'MATERIAL_STORE_OWNER' || role === 'STORE') return `/store/chat/${roomId}`;
  if (role === 'CONTRACTOR') return `/contractor/chat/${roomId}`;
  return `/customer/chat/${roomId}`;
}

module.exports = {
  ROOM_KIND,
  isStoreChat,
  canCreateStoreRoom,
  canSendInStoreRoom,
  quotationAllowed,
  chatPathForRole,
};
