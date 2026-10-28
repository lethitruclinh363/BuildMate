const { ApiError } = require('./ApiError');

const SENSITIVE_DOCUMENT_TYPES = new Set([
  'CCCD_FRONT',
  'CCCD_BACK',
  'ID_CARD',
  'BUSINESS_LICENSE',
  'CERTIFICATE',
]);

const PRIVATE_PREFIX = 'private:verification:';

function isSensitiveDocumentType(type) {
  return SENSITIVE_DOCUMENT_TYPES.has(String(type || ''));
}

function privateDocumentUrl(relativePath) {
  return `${PRIVATE_PREFIX}${String(relativePath || '').replace(/\\/g, '/')}`;
}

function parsePrivateDocumentUrl(url) {
  const value = String(url || '');
  if (!value.startsWith(PRIVATE_PREFIX)) return null;
  return value.slice(PRIVATE_PREFIX.length);
}

function assertCanReadVerificationDoc({ role, userId, ownerId }) {
  if (!userId || !role) {
    throw new ApiError(401, 'Authentication required');
  }
  if (role === 'ADMIN') return;
  if (
    (role === 'CONTRACTOR' || role === 'MATERIAL_STORE_OWNER') &&
    String(userId) === String(ownerId)
  ) {
    return;
  }
  throw new ApiError(403, 'You are not allowed to view this document');
}

module.exports = {
  SENSITIVE_DOCUMENT_TYPES,
  isSensitiveDocumentType,
  privateDocumentUrl,
  parsePrivateDocumentUrl,
  assertCanReadVerificationDoc,
};
