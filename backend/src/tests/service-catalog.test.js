const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  collapseServiceName,
  normalizeServiceName,
  foldServiceName,
  findSystemService,
  servicesBlockReason,
  visibleOnboardingServices,
  insertUnique,
} = require('../constants/contractorServices');

describe('service name normalization', () => {
  it('treats spacing and case variants of a Vietnamese name as the same service', () => {
    const expected = normalizeServiceName('Lắp đèn');
    assert.equal(normalizeServiceName('lắp đèn'), expected);
    assert.equal(normalizeServiceName('LẮP ĐÈN'), expected);
    assert.equal(normalizeServiceName(' Lắp đèn '), expected);
    assert.equal(normalizeServiceName('lắp   đèn'), expected);
  });

  it('keeps Vietnamese diacritics', () => {
    assert.notEqual(normalizeServiceName('lap den'), normalizeServiceName('lắp đèn'));
  });

  it('folds diacritics only for duplicate detection', () => {
    assert.equal(foldServiceName('Lắp Đèn'), foldServiceName('lap den'));
    assert.notEqual(foldServiceName('Lắp đèn điện'), foldServiceName('Lắp đèn'));
  });

  it('matches Unicode composed and decomposed Vietnamese text', () => {
    assert.equal(normalizeServiceName('L\u0103\u0301p đèn'), normalizeServiceName('Lắp đèn'));
  });

  it('collapses whitespace without lowercasing the stored display name', () => {
    assert.equal(collapseServiceName('  Thi   công   mái kính '), 'Thi công mái kính');
  });
});

describe('system catalog matching', () => {
  it('finds Lắp đèn in the Electrical catalog', () => {
    const match = findSystemService(' lắp   đèn ');
    assert.equal(match.category, 'Electrical');
    assert.equal(match.name, 'Lighting');
  });

  it('finds the English catalog name too', () => {
    assert.equal(findSystemService('Lighting').name, 'Lighting');
  });

  it('does not match a name that is not in the catalog', () => {
    assert.equal(findSystemService('Thi công mái kính'), null);
  });
});

describe('selected service rules', () => {
  it('accepts one system service', () => {
    assert.equal(
      servicesBlockReason([{ category: 'Electrical', name: 'Lighting', type: 'SYSTEM', serviceId: 'Electrical::Lighting', status: 'APPROVED' }]),
      ''
    );
  });

  it('rejects a second copy of the same system service', () => {
    const item = { category: 'Electrical', name: 'Lighting', type: 'SYSTEM', serviceId: 'Electrical::Lighting', status: 'APPROVED' };
    assert.equal(servicesBlockReason([item, item]), 'This service is already added.');
  });

  it('rejects a custom name that matches the catalog', () => {
    assert.equal(
      servicesBlockReason([{ category: 'Electrical', name: 'Lắp đèn', type: 'CUSTOM', status: 'PENDING_APPROVAL' }]),
      'This service already exists in the BuildMate catalog.'
    );
  });

  it('rejects a rejected custom service', () => {
    assert.equal(
      servicesBlockReason([{ category: 'Construction', name: 'Thi công mái kính', type: 'CUSTOM', serviceId: 'a'.repeat(24), status: 'REJECTED' }]),
      'This service cannot be registered.'
    );
  });

  it('accepts a catalog service that is not in the original fixed list', () => {
    assert.equal(
      servicesBlockReason([{ category: 'Electrical', name: 'Lắp camera', type: 'SYSTEM', serviceId: 'c'.repeat(24), status: 'APPROVED' }]),
      ''
    );
  });

  it('accepts a pending custom service that is linked to the catalog', () => {
    assert.equal(
      servicesBlockReason([{ category: 'Construction', name: 'Thi công mái kính', type: 'CUSTOM', serviceId: 'b'.repeat(24), status: 'PENDING_APPROVAL' }]),
      ''
    );
  });
});

describe('public visibility', () => {
  it('hides custom services until an admin approves them', () => {
    const visible = visibleOnboardingServices([
      { name: 'Lighting', type: 'SYSTEM', status: 'APPROVED' },
      { name: 'Thi công mái kính', type: 'CUSTOM', status: 'PENDING_APPROVAL' },
      { name: 'Sửa mái tôn', type: 'CUSTOM', status: 'REJECTED' },
      { name: 'Lắp camera', type: 'CUSTOM', status: 'APPROVED' },
    ]);
    assert.deepEqual(visible.map((item) => item.name), ['Lighting', 'Lắp camera']);
  });
});

describe('unique custom name claim', () => {
  it('keeps a single record when two creates race', async () => {
    let stored = null;
    let creates = 0;
    const payload = { name: 'Thi công mái kính', normalizedName: 'thi công mái kính' };
    const result = await Promise.all([
      insertUnique(payload, {
        create: async () => {
          creates += 1;
          if (stored) {
            const error = new Error('duplicate');
            error.code = 11000;
            throw error;
          }
          stored = { ...payload, _id: 'one' };
          return stored;
        },
        find: async () => stored,
      }),
      insertUnique(payload, {
        create: async () => {
          creates += 1;
          if (stored) {
            const error = new Error('duplicate');
            error.code = 11000;
            throw error;
          }
          stored = { ...payload, _id: 'one' };
          return stored;
        },
        find: async () => stored,
      }),
    ]);
    const created = result.filter((item) => item.created);
    assert.equal(created.length, 1);
    assert.equal(result[0].doc._id, result[1].doc._id);
    assert.equal(stored._id, 'one');
    assert.ok(creates >= 1);
  });
});

describe('catalog collection', () => {
  it('stores custom names separately from priced store services and enforces a unique normalized name', async () => {
    const { prisma } = require('../config/prisma');
    const rows = await prisma.$queryRaw`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'catalog_services'
        AND indexdef ILIKE '%normalized_name%'
    `;
    assert.ok(rows.length >= 1);
  });
});
