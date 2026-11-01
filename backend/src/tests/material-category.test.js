const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MATERIAL_CATEGORIES,
  findSystemCategory,
  classifyMaterialCategory,
  resolveMaterialSelection,
  categoriesFromLegacyAreas,
  CATEGORY_MESSAGES,
} = require('../constants/material-categories');
const { MATERIAL_CATEGORIES: exportedCategories } = require('../models/Material');

describe('material category normalization', () => {
  it('treats case, spacing, and Unicode variants of a system category as the same category', () => {
    assert.equal(findSystemCategory('Xi măng'), 'Cement');
    assert.equal(findSystemCategory(' xi măng '), 'Cement');
    assert.equal(findSystemCategory('XI MĂNG'), 'Cement');
    assert.equal(findSystemCategory('xi   măng'), 'Cement');
    assert.equal(findSystemCategory('Xi ma\u0306ng'), 'Cement');
    assert.equal(findSystemCategory('CEMENT'), 'Cement');
  });

  it('keeps a new store category distinct from the system list', () => {
    assert.equal(findSystemCategory('Đá granite'), null);
    assert.equal(findSystemCategory('Vật liệu chống thấm'), null);
    assert.equal(findSystemCategory('Thiết bị vệ sinh'), null);
  });
});

describe('custom material category claims', () => {
  const owned = [{ _id: 'granite-1', name: 'Đá granite', status: 'APPROVED', ownerId: 'store-1' }];

  it('rejects a system name instead of creating another system category', () => {
    const result = classifyMaterialCategory('Xi măng', owned);
    assert.equal(result.code, 'DUPLICATE_SYSTEM_CATEGORY');
    assert.equal(result.category.type, 'SYSTEM');
    assert.equal(result.category.name, 'Cement');
  });

  it('rejects a custom name the same store already added, including case and spacing', () => {
    assert.equal(classifyMaterialCategory(' đá granite ', owned).code, 'DUPLICATE_CUSTOM_CATEGORY');
    assert.equal(classifyMaterialCategory('ĐÁ GRANITE', owned).code, 'DUPLICATE_CUSTOM_CATEGORY');
    assert.equal(classifyMaterialCategory('đá   granite', owned).category.categoryId, 'granite-1');
  });

  it('accepts a category that is not in the system and not already on the store', () => {
    const result = classifyMaterialCategory('  Thiết bị   vệ sinh ', []);
    assert.equal(result.code, 'AVAILABLE');
    assert.equal(result.displayName, 'Thiết bị vệ sinh');
    assert.equal(result.category, null);
  });

  it('asks for a name when the field is blank', () => {
    assert.equal(classifyMaterialCategory('   ', []).code, 'INVALID');
  });
});

describe('selected material categories', () => {
  const owned = [{ _id: 'granite-1', name: 'Đá granite', status: 'APPROVED', ownerId: 'store-1' }];

  it('keeps several system categories and one custom category without duplicates', () => {
    const result = resolveMaterialSelection(
      [
        { name: 'Cement', type: 'SYSTEM' },
        { name: 'Tiles', type: 'SYSTEM' },
        { name: 'Steel', type: 'SYSTEM' },
        { name: 'Đá granite', type: 'CUSTOM', categoryId: 'granite-1' },
      ],
      owned
    );
    assert.equal(result.error, '');
    assert.deepEqual(
      result.items.map((item) => item.name),
      ['Cement', 'Tiles', 'Steel', 'Đá granite']
    );
    assert.deepEqual(
      result.items.map((item) => item.type),
      ['SYSTEM', 'SYSTEM', 'SYSTEM', 'CUSTOM']
    );
  });

  it('does not accept the same system category twice, even under a different label', () => {
    const result = resolveMaterialSelection(['Cement', 'Xi măng'], []);
    assert.equal(result.error, CATEGORY_MESSAGES.CUSTOM);
    assert.equal(result.items.length, 0);
  });

  it('maps a system label onto the existing category and does not store it as custom', () => {
    const result = resolveMaterialSelection([{ name: 'XI MĂNG', type: 'SYSTEM' }], []);
    assert.equal(result.error, '');
    assert.deepEqual(result.items, [{ name: 'Cement', type: 'SYSTEM', categoryId: null, status: 'APPROVED' }]);
  });

  it('refuses a custom category whose name matches a system category', () => {
    const result = resolveMaterialSelection([{ name: 'Xi măng', type: 'CUSTOM' }], []);
    assert.equal(result.code, 'DUPLICATE_SYSTEM_CATEGORY');
    assert.equal(result.error, CATEGORY_MESSAGES.SYSTEM);
  });

  it('refuses a second custom spelling of a category the store already selected', () => {
    const result = resolveMaterialSelection(
      [
        { name: 'Đá granite', type: 'CUSTOM', categoryId: 'granite-1' },
        { name: 'ĐÁ GRANITE', type: 'CUSTOM', categoryId: 'granite-1' },
      ],
      owned
    );
    assert.equal(result.error, CATEGORY_MESSAGES.CUSTOM);
  });

  it('does not accept a custom name that this store has not created', () => {
    const result = resolveMaterialSelection([{ name: 'Thiết bị vệ sinh', type: 'CUSTOM' }], owned);
    assert.equal(result.code, 'INVALID');
  });

  it('restores a previously saved system selection from stored names', () => {
    const result = resolveMaterialSelection(['Cement', 'Paint', 'Pipe'], []);
    assert.equal(result.error, '');
    assert.equal(result.items.length, 3);
    assert.ok(result.items.every((item) => item.type === 'SYSTEM'));
  });
});

describe('material category source', () => {
  it('uses the material catalog as the only system list', () => {
    assert.deepEqual(exportedCategories, MATERIAL_CATEGORIES);
    assert.ok(MATERIAL_CATEGORIES.includes('Waterproof coat'));
    assert.equal(MATERIAL_CATEGORIES.includes('Electrical'), false);
  });

  it('reads a store that saved category keys in serviceAreas before materialCategories existed', () => {
    const picks = categoriesFromLegacyAreas(['Cement', 'Paint', 'Pipe', 'Tiles', 'Steel', 'Tools', 'Fixtures', 'Ninh Kieu']);
    assert.deepEqual(
      picks.map((item) => item.name),
      ['Cement', 'Paint', 'Pipe', 'Tiles', 'Steel', 'Tools', 'Fixtures']
    );
    assert.ok(picks.every((item) => item.type === 'SYSTEM'));
  });

  it('keeps a legacy custom name and ignores delivery areas', () => {
    const owned = [{ _id: 'granite-1', name: 'Đá granite', foldedName: 'da granite', status: 'APPROVED' }];
    const picks = categoriesFromLegacyAreas(['Can Tho', 'ĐÁ GRANITE'], owned);
    assert.equal(picks.length, 1);
    assert.equal(picks[0].type, 'CUSTOM');
    assert.equal(picks[0].name, 'Đá granite');
  });

  it('rejects an admin category that only differs by case or spaces', () => {
    assert.equal(classifyMaterialCategory(' xi măng ', [], []).code, 'DUPLICATE_SYSTEM_CATEGORY');
    assert.equal(classifyMaterialCategory('XI MĂNG', [], [{ name: 'Gỗ sồi' }]).code, 'DUPLICATE_SYSTEM_CATEGORY');
    assert.equal(classifyMaterialCategory(' gỗ sồi ', [], [{ name: 'Gỗ sồi' }]).code, 'DUPLICATE_SYSTEM_CATEGORY');
    assert.equal(classifyMaterialCategory('Thiết bị vệ sinh', [], [{ name: 'Gỗ sồi' }]).code, 'AVAILABLE');
  });
});
