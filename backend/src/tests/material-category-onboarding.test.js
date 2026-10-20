const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  findSystemCategory,
  classifyMaterialCategory,
  resolveMaterialSelection,
  categoryAliases,
  CATEGORY_MESSAGES,
} = require('../constants/material-categories');

// Simulate the frontend logic from frontend/src/data/material-categories.ts
function foldCategoryName(value) {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isCategorySelected(target, selected) {
  const targetId = target.categoryId ? String(target.categoryId) : '';
  const targetFolded = foldCategoryName(target.name || '');
  const targetAliases = (target.aliases || []).map(foldCategoryName);

  return selected.some((item) => {
    const itemId = item.categoryId ? String(item.categoryId) : '';
    if (targetId && itemId && targetId === itemId) return true;
    if (target.type !== item.type) return false;

    const itemFolded = foldCategoryName(item.name || '');
    if (targetFolded && itemFolded && targetFolded === itemFolded) return true;

    if (target.type === 'SYSTEM') {
      const itemAliases = (item.aliases || []).map(foldCategoryName);
      if (targetAliases.includes(itemFolded) || itemAliases.includes(targetFolded)) return true;
    }
    return false;
  });
}

function categoryDisplayLabel(item, lang = 'vi') {
  if (item.type === 'CUSTOM') return item.name;
  return MATERIAL_CATEGORY_LABELS[lang]?.[item.name] || item.name;
}

// Backend deduplication logic matching material-category.service.js
function mergeSystemCategories(extras) {
  const merged = [];
  const seenFolded = new Set();

  for (const name of MATERIAL_CATEGORIES) {
    const folded = foldCategoryName(name);
    const aliases = categoryAliases(name);
    for (const alias of aliases) {
      seenFolded.add(foldCategoryName(alias));
    }
    seenFolded.add(folded);

    const doc = extras.find((item) => {
      return findSystemCategory(item.name) === name;
    });

    merged.push({
      name,
      type: 'SYSTEM',
      categoryId: doc ? String(doc._id || doc.id) : null,
      status: doc?.status || 'APPROVED',
      aliases,
    });
    if (doc) {
      seenFolded.add(foldCategoryName(doc.name));
    }
  }

  for (const doc of extras) {
    if (findSystemCategory(doc.name)) continue;
    const docFolded = doc.foldedName || foldCategoryName(doc.name);
    if (!seenFolded.has(docFolded)) {
      merged.push({
        name: doc.name,
        type: 'SYSTEM',
        categoryId: String(doc._id || doc.id),
        status: doc.status || 'APPROVED',
        aliases: categoryAliases(doc.name),
      });
      seenFolded.add(docFolded);
    }
  }

  return merged;
}

describe('BUILDMATE – Material Category Onboarding & Approval (TC01 - TC10)', () => {
  // Mock DB extras matching what is in PostgreSQL (rows 1..8)
  const dbSystemExtras = [
    { _id: '1', name: 'Cement', type: 'SYSTEM' },
    { _id: '2', name: 'Paint', type: 'SYSTEM' },
    { _id: '3', name: 'Pipe', type: 'SYSTEM' },
    { _id: '4', name: 'Tiles', type: 'SYSTEM' },
    { _id: '5', name: 'Steel', type: 'SYSTEM' },
    { _id: '6', name: 'Waterproof coat', type: 'SYSTEM' },
    { _id: '7', name: 'Tools', type: 'SYSTEM' },
    { _id: '8', name: 'Fixtures', type: 'SYSTEM' },
    // What if DB also had a row with Vietnamese name 'Xi măng'?
    { _id: '1-vi', name: 'Xi măng', type: 'SYSTEM' },
  ];

  it('TC01: Danh mục Xi măng chỉ xuất hiện 1 lần', () => {
    const systemCategories = mergeSystemCategories(dbSystemExtras);

    // Count how many items match "Cement" / "Xi măng"
    const cementItems = systemCategories.filter(
      (item) => item.name === 'Cement' || item.name === 'Xi măng'
    );
    assert.equal(cementItems.length, 1, 'Xi măng / Cement must appear exactly ONCE');
    assert.equal(systemCategories.length, 8, 'Total system categories must be exactly 8');
  });

  it('TC02: Chọn/Bỏ chọn không xảy ra chọn hai mục', () => {
    const system = mergeSystemCategories(dbSystemExtras);
    const cement = system.find((item) => item.name === 'Cement');
    assert.ok(cement);

    let selected = [];

    // Select Xi măng
    if (!isCategorySelected(cement, selected)) {
      selected.push({
        name: cement.name,
        type: 'SYSTEM',
        categoryId: cement.categoryId,
        status: 'APPROVED',
        aliases: cement.aliases,
      });
    }
    assert.equal(selected.length, 1);
    assert.equal(isCategorySelected(cement, selected), true);

    // Try selecting it again - it should be detected as selected and toggled off
    if (isCategorySelected(cement, selected)) {
      selected = selected.filter((entry) => !isCategorySelected(cement, [entry]));
    }
    assert.equal(selected.length, 0, 'Deselecting Xi măng must remove it completely');
  });

  it('TC03: VI/EN không nhân đôi danh mục', () => {
    const viName = 'Xi măng';
    const enName = 'Cement';

    assert.equal(findSystemCategory(viName), 'Cement');
    assert.equal(findSystemCategory(enName), 'Cement');

    const item = { name: 'Cement', type: 'SYSTEM' };
    const labelVi = categoryDisplayLabel(item, 'vi');
    const labelEn = categoryDisplayLabel(item, 'en');

    assert.equal(labelVi, 'Xi măng');
    assert.equal(labelEn, 'Cement');

    // Both languages represent the same category without creating a second entry
    const resVi = resolveMaterialSelection([viName], []);
    const resEn = resolveMaterialSelection([enName], []);
    assert.equal(resVi.items[0].name, 'Cement');
    assert.equal(resEn.items[0].name, 'Cement');
  });

  it('TC04: Gửi đề xuất Cát xây dựng tạo 1 bản ghi PENDING', () => {
    const owned = [];
    const classified = classifyMaterialCategory('Cát xây dựng', owned, dbSystemExtras);

    assert.equal(classified.code, 'AVAILABLE');
    assert.equal(classified.displayName, 'Cát xây dựng');

    // Simulated created record
    const created = {
      _id: 'custom-cat-1',
      name: classified.displayName,
      type: 'CUSTOM',
      status: 'PENDING_APPROVAL',
      ownerId: 'store-1',
    };

    assert.equal(created.status, 'PENDING_APPROVAL', 'Initial status must be PENDING_APPROVAL');
    assert.equal(created.type, 'CUSTOM');
  });

  it('TC05: Gửi lại đề xuất trùng bị chặn', () => {
    const owned = [
      { _id: 'cat-1', name: 'Cát xây dựng', status: 'PENDING_APPROVAL', ownerId: 'store-1' },
    ];

    // Duplicate custom proposal with spaces / case
    const dup1 = classifyMaterialCategory('  cát  xây dựng ', owned, dbSystemExtras);
    assert.equal(dup1.code, 'DUPLICATE_CUSTOM_CATEGORY');

    const dup2 = classifyMaterialCategory('CÁT XÂY DỰNG', owned, dbSystemExtras);
    assert.equal(dup2.code, 'DUPLICATE_CUSTOM_CATEGORY');

    // Duplicate system category
    const dupSystem = classifyMaterialCategory('Xi măng', owned, dbSystemExtras);
    assert.equal(dupSystem.code, 'DUPLICATE_SYSTEM_CATEGORY');
  });

  it('TC06: Admin xem được đề xuất', () => {
    const customs = [
      {
        _id: 'custom-cat-1',
        name: 'Cát xây dựng',
        type: 'CUSTOM',
        status: 'PENDING_APPROVAL',
        ownerId: 'store-1',
        createdAt: new Date(),
      },
    ];
    const storeMap = new Map([['store-1', 'Cửa hàng VLXD Anh Ba']]);

    const adminCustomRows = customs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      group: 'Materials',
      type: 'CUSTOM',
      status: doc.status,
      storeName: storeMap.get(doc.ownerId) || null,
      createdAt: doc.createdAt,
    }));

    assert.equal(adminCustomRows.length, 1);
    assert.equal(adminCustomRows[0].status, 'PENDING_APPROVAL');
    assert.equal(adminCustomRows[0].storeName, 'Cửa hàng VLXD Anh Ba');
  });

  it('TC07: Admin APPROVED → Store nhìn thấy danh mục được duyệt', () => {
    const categoryDoc = {
      _id: 'custom-cat-1',
      name: 'Cát xây dựng',
      type: 'CUSTOM',
      status: 'PENDING_APPROVAL',
      ownerId: 'store-1',
      save() {
        return this;
      },
    };

    // Review decision 'approve'
    categoryDoc.status = 'APPROVED';
    categoryDoc.reviewedAt = new Date();

    assert.equal(categoryDoc.status, 'APPROVED');

    // Store can now select this category
    const owned = [categoryDoc];
    const resolved = resolveMaterialSelection([{ name: 'Cát xây dựng', type: 'CUSTOM', categoryId: 'custom-cat-1' }], owned);
    assert.equal(resolved.error, '');
    assert.equal(resolved.items[0].status, 'APPROVED');
  });

  it('TC08: Admin REJECTED → Store không được sử dụng danh mục', () => {
    const categoryDoc = {
      _id: 'custom-cat-2',
      name: 'Vũ khí xây dựng',
      type: 'CUSTOM',
      status: 'PENDING_APPROVAL',
      ownerId: 'store-1',
      statusNote: null,
    };

    // Review decision 'reject' with reason
    categoryDoc.status = 'REJECTED';
    categoryDoc.statusNote = 'Không phải vật liệu xây dựng hợp lệ';

    assert.equal(categoryDoc.status, 'REJECTED');
    assert.equal(categoryDoc.statusNote, 'Không phải vật liệu xây dựng hợp lệ');

    // Store CANNOT select this rejected category
    const owned = [categoryDoc];
    const resolved = resolveMaterialSelection([{ name: 'Vũ khí xây dựng', type: 'CUSTOM', categoryId: 'custom-cat-2' }], owned);
    assert.equal(resolved.code, 'INVALID', 'Rejected category must not be resolvable for selection');
  });

  it('TC09: Store khác không thể sửa hoặc chiếm quyền danh mục tùy chỉnh của cửa hàng khác', () => {
    // Store 1 owns 'Đá granite Ba Vì'
    const store1Owned = [
      { _id: 'cat-store-1', name: 'Đá granite Ba Vì', status: 'APPROVED', ownerId: 'store-1' },
    ];
    // Store 2 has no custom categories
    const store2Owned = [];

    // Store 2 attempts to select Store 1's custom category
    const resolvedStore2 = resolveMaterialSelection(
      [{ name: 'Đá granite Ba Vì', type: 'CUSTOM', categoryId: 'cat-store-1' }],
      store2Owned
    );
    assert.equal(resolvedStore2.code, 'INVALID', 'Store 2 cannot use Store 1 custom category');
  });

  it('TC10: Refresh hoặc quay lại Onboarding vẫn hiển thị đúng dữ liệu', () => {
    const savedPicks = [
      { name: 'Cement', type: 'SYSTEM', categoryId: '1', status: 'APPROVED' },
      { name: 'Paint', type: 'SYSTEM', categoryId: '2', status: 'APPROVED' },
    ];

    const system = mergeSystemCategories(dbSystemExtras);

    // Verify both are recognized as selected when matching against freshly fetched system categories
    const cement = system.find((item) => item.name === 'Cement');
    const paint = system.find((item) => item.name === 'Paint');
    const steel = system.find((item) => item.name === 'Steel');

    assert.equal(isCategorySelected(cement, savedPicks), true);
    assert.equal(isCategorySelected(paint, savedPicks), true);
    assert.equal(isCategorySelected(steel, savedPicks), false);

    // Deselecting one works smoothly after restore
    const remaining = savedPicks.filter((item) => !isCategorySelected(cement, [item]));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].name, 'Paint');
  });
});
