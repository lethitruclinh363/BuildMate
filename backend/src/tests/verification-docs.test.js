const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { verificationDocsReady } = require('../services/contractor.service');

function profile(types) {
  return { documents: types.map((type) => ({ type, url: `/uploads/${type}.jpg` })) };
}

describe('verification documents', () => {
  it('stays incomplete with no documents', () => {
    assert.equal(verificationDocsReady(profile([]), 'CONTRACTOR'), false);
    assert.equal(verificationDocsReady(profile([]), 'MATERIAL_STORE_OWNER'), false);
  });

  it('rejects a contractor who only uploaded the front of the ID card', () => {
    assert.equal(verificationDocsReady(profile(['CCCD_FRONT']), 'CONTRACTOR'), false);
  });

  it('rejects a contractor missing the business license', () => {
    assert.equal(verificationDocsReady(profile(['CCCD_FRONT', 'CCCD_BACK']), 'CONTRACTOR'), false);
  });

  it('rejects a contractor missing the certificate', () => {
    assert.equal(
      verificationDocsReady(profile(['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE']), 'CONTRACTOR'),
      false
    );
  });

  it('accepts a contractor with all four document types', () => {
    assert.equal(
      verificationDocsReady(
        profile(['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE', 'CERTIFICATE']),
        'CONTRACTOR'
      ),
      true
    );
  });

  it('does not treat a legacy ID card as either side of the new ID card', () => {
    assert.equal(
      verificationDocsReady(
        profile(['ID_CARD', 'ID_CARD', 'BUSINESS_LICENSE', 'CERTIFICATE']),
        'CONTRACTOR'
      ),
      false
    );
  });

  it('accepts a material store without a certificate', () => {
    assert.equal(
      verificationDocsReady(profile(['CCCD_FRONT', 'CCCD_BACK', 'BUSINESS_LICENSE']), 'MATERIAL_STORE_OWNER'),
      true
    );
  });

  it('still requires both ID card sides and a license for a material store', () => {
    assert.equal(
      verificationDocsReady(profile(['CCCD_FRONT', 'BUSINESS_LICENSE', 'CERTIFICATE']), 'MATERIAL_STORE_OWNER'),
      false
    );
  });
});
