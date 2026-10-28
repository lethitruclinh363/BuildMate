const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ApiError } = require('../utils/ApiError');
const {
  SENSITIVE_DOCUMENT_TYPES,
  isSensitiveDocumentType,
  privateDocumentUrl,
  parsePrivateDocumentUrl,
  assertCanReadVerificationDoc,
} = require('../utils/verification-docs');
const { resolvePrivate } = require('../services/verificationStorage');
const { isBlockedPublicUpload } = require('../utils/public-uploads');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const ADMIN_ROOT = path.resolve(__dirname, '../../../admin/src');

describe('verification document classification', () => {
  it('treats CCCD, ID card, license and certificate as private', () => {
    for (const type of ['CCCD_FRONT', 'CCCD_BACK', 'ID_CARD', 'BUSINESS_LICENSE', 'CERTIFICATE']) {
      assert.equal(isSensitiveDocumentType(type), true, type);
    }
    assert.equal(SENSITIVE_DOCUMENT_TYPES.has('STORE_IMAGE'), false);
    assert.equal(SENSITIVE_DOCUMENT_TYPES.has('PORTFOLIO'), false);
  });

  it('builds and parses private verification URLs', () => {
    const url = privateDocumentUrl('owner-1/front.jpg');
    assert.equal(url.startsWith('private:verification:'), true);
    assert.equal(parsePrivateDocumentUrl(url), 'owner-1/front.jpg');
    assert.equal(parsePrivateDocumentUrl('/uploads/contractors/x.jpg'), null);
  });
});

describe('verification document ACL', () => {
  const owner = { role: 'MATERIAL_STORE_OWNER', userId: 'owner-a' };

  it('allows the owning partner and admin', () => {
    assert.doesNotThrow(() => assertCanReadVerificationDoc({ ...owner, ownerId: 'owner-a' }));
    assert.doesNotThrow(() =>
      assertCanReadVerificationDoc({ role: 'ADMIN', userId: 'admin-1', ownerId: 'owner-a' })
    );
    assert.doesNotThrow(() =>
      assertCanReadVerificationDoc({ role: 'CONTRACTOR', userId: 'owner-a', ownerId: 'owner-a' })
    );
  });

  it('blocks guests, customers and other partners', () => {
    assert.throws(
      () => assertCanReadVerificationDoc({ role: null, userId: null, ownerId: 'owner-a' }),
      (err) => err instanceof ApiError && err.statusCode === 401
    );
    assert.throws(
      () => assertCanReadVerificationDoc({ role: 'CUSTOMER', userId: 'cust-1', ownerId: 'owner-a' }),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
    assert.throws(
      () => assertCanReadVerificationDoc({ role: 'CONTRACTOR', userId: 'owner-b', ownerId: 'owner-a' }),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
    assert.throws(
      () =>
        assertCanReadVerificationDoc({
          role: 'MATERIAL_STORE_OWNER',
          userId: 'owner-b',
          ownerId: 'owner-a',
        }),
      (err) => err instanceof ApiError && err.statusCode === 403
    );
  });
});

describe('legacy public /uploads contractor files', () => {
  it('stops serving contractor verification files on the public static route', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
    assert.match(app, /isBlockedPublicUpload/);
    assert.equal(isBlockedPublicUpload('/uploads/contractors/old-cccd.jpg'), true);
  });
});

describe('private verification storage paths', () => {
  it('rejects paths that leave the private folder', () => {
    assert.throws(() => resolvePrivate('../uploads/secret.jpg'), ApiError);
    assert.throws(() => resolvePrivate(''), ApiError);
  });
});

describe('Flow 02 frontend and admin private document handling', () => {
  it('does not render a raw private: URL as an image src', () => {
    const thumb = fs.readFileSync(path.join(FRONTEND_ROOT, 'components/partner/VerificationDocThumb.tsx'), 'utf8');
    assert.match(thumb, /private:/);
    assert.match(thumb, /responseType:\s*'blob'/);
  });

  it('admin fetches private verification files with an authenticated blob request', () => {
    const api = fs.readFileSync(path.join(ADMIN_ROOT, 'services/admin.api.ts'), 'utf8');
    assert.match(api, /verifications\/\$\{id\}\/documents\/\$\{documentId\}\/file/);
    assert.match(api, /responseType:\s*'blob'/);
  });
});

describe('eKYC logs do not print identity numbers', () => {
  it('does not log idTail or the identity number', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/contractorEkycService.js'), 'utf8');
    assert.equal(src.includes('idTail'), false);
    assert.equal(/console\.(info|log|warn|error)[^\n]*(idNumber|id_card_number)/.test(src), false);
  });
});

describe('authenticated verification file routes', () => {
  it('moves sensitive uploads off the public /uploads tree', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../controllers/contractorController.js'), 'utf8');
    assert.match(src, /isSensitiveDocumentType/);
    assert.match(src, /saveFromDisk/);
    assert.match(src, /privateDocumentUrl/);
  });

  it('resolves eKYC-linked documents through the owner file route', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/contractorService.js'), 'utf8');
    assert.match(src, /private:ekyc:/);
    assert.match(src, /openForOwner/);
  });
});
