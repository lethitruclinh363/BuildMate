const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  offeringIdentity,
  matchesCatalogName,
  publicPricedServiceMatch,
} = require('../constants/contractor-services');

describe('contractor service identity', () => {
  it('maps a Vietnamese catalog name to the shared system service', () => {
    const identity = offeringIdentity({ type: 'SYSTEM', category: 'Electrical', name: 'Lắp đèn' });
    assert.equal(identity.catalogKey, 'Electrical::Lighting');
    assert.equal(identity.name, 'Lighting');
    assert.equal(identity.catalogType, 'SYSTEM');
  });

  it('keeps a pending custom proposal out of contractor offerings', () => {
    assert.equal(
      offeringIdentity({
        type: 'CUSTOM',
        name: 'Thi công mái kính',
        category: 'Construction',
        serviceId: 'a'.repeat(24),
        status: 'PENDING_APPROVAL',
      }),
      null
    );
  });

  it('links an approved custom name by its catalog id', () => {
    const id = 'b'.repeat(24);
    const identity = offeringIdentity({
      type: 'CUSTOM',
      name: 'Thi công mái kính',
      category: 'Construction',
      serviceId: id,
      status: 'APPROVED',
    });
    assert.equal(identity.catalogKey, id);
    assert.equal(identity.catalogType, 'CUSTOM');
  });

  it('recognizes a legacy priced row that already uses the catalog name', () => {
    const identity = offeringIdentity({ type: 'SYSTEM', category: 'Electrical', name: 'Lighting' });
    assert.equal(matchesCatalogName(' lắp   đèn ', identity), true);
    assert.equal(matchesCatalogName('Sơn trong nhà', identity), false);
  });
});

describe('public priced services', () => {
  it('requires an active completed service with a real price', () => {
    assert.deepEqual(publicPricedServiceMatch(), {
      isActive: true,
      basePrice: { $gt: 0 },
      completionStatus: { $ne: 'INCOMPLETE' },
    });
  });
});
