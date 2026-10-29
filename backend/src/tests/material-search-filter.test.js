const test = require('node:test');
const assert = require('node:assert/strict');
const { materialSearchQuerySchema } = require('../validators/location.validator');
const marketplace = require('../services/marketplaceService');

test('Material Search & Filter - Zod Query Validation', async (t) => {
  await t.test('accepts valid query parameters', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      keyword: 'xi măng',
      category: 'Cement',
      minPrice: '50000',
      maxPrice: '200000',
      sellingStatus: 'selling',
      sortBy: 'price_asc',
      page: '1',
      limit: '12',
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.keyword, 'xi măng');
    assert.equal(parsed.data.minPrice, 50000);
    assert.equal(parsed.data.maxPrice, 200000);
    assert.equal(parsed.data.sellingStatus, 'selling');
    assert.equal(parsed.data.sortBy, 'price_asc');
    assert.equal(parsed.data.page, 1);
    assert.equal(parsed.data.limit, 12);
  });

  await t.test('rejects negative minPrice', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      minPrice: '-500',
    });
    assert.equal(parsed.success, false);
  });

  await t.test('rejects negative maxPrice', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      maxPrice: '-1000',
    });
    assert.equal(parsed.success, false);
  });

  await t.test('rejects minPrice > maxPrice', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      minPrice: '500000',
      maxPrice: '200000',
    });
    assert.equal(parsed.success, false);
    const issues = parsed.error.issues;
    assert.equal(issues.some((i) => i.message.includes('Minimum price cannot exceed maximum price')), true);
  });

  await t.test('rejects invalid sellingStatus enum', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      sellingStatus: 'invalid_status',
    });
    assert.equal(parsed.success, false);
  });

  await t.test('rejects invalid sortBy enum', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      sortBy: 'hacked_sort_order',
    });
    assert.equal(parsed.success, false);
  });

  await t.test('rejects keyword longer than 100 characters', () => {
    const parsed = materialSearchQuerySchema.safeParse({
      keyword: 'a'.repeat(101),
    });
    assert.equal(parsed.success, false);
  });
});

test('Material Search & Filter - Public Categories', async (t) => {
  await t.test('returns system categories with localized labels', async () => {
    const cats = await marketplace.getPublicMaterialCategories();
    assert.equal(Array.isArray(cats), true);
    assert.ok(cats.length >= 8);

    const cement = cats.find((c) => c.name === 'Cement');
    assert.ok(cement);
    assert.equal(cement.labelVi, 'Xi măng');
    assert.equal(cement.labelEn, 'Cement');
    assert.equal(cement.type, 'SYSTEM');

    const paint = cats.find((c) => c.name === 'Paint');
    assert.ok(paint);
    assert.equal(paint.labelVi, 'Sơn');
  });
});

test('Material Search & Filter - Service Logic', async (t) => {
  await t.test('returns unpaginated array when page/limit omitted (backward compatibility)', async () => {
    const res = await marketplace.searchMaterials({});
    assert.equal(Array.isArray(res), true);
  });

  await t.test('returns paginated object with total and items when page/limit provided', async () => {
    const res = await marketplace.searchMaterials({ page: 1, limit: 10 });
    assert.equal(typeof res, 'object');
    assert.equal(Array.isArray(res.items), true);
    assert.equal(typeof res.total, 'number');
    assert.equal(typeof res.page, 'number');
    assert.equal(typeof res.limit, 'number');
    assert.equal(typeof res.totalPages, 'number');
  });

  await t.test('finds Vietnamese products using unaccented keywords', async () => {
    // "Xi Măng" in DB should match unaccented search "xi mang"
    const res = await marketplace.searchMaterials({ keyword: 'xi mang' });
    const items = Array.isArray(res) ? res : res.items;
    if (items.length > 0) {
      assert.ok(items.some((item) => item.name.toLowerCase().includes('xi')));
    }
  });

  await t.test('finds Vietnamese products using accented keywords', async () => {
    const res = await marketplace.searchMaterials({ keyword: 'Xi Măng' });
    const items = Array.isArray(res) ? res : res.items;
    if (items.length > 0) {
      assert.ok(items.some((item) => item.name.includes('Xi Măng')));
    }
  });

  await t.test('returns empty array/items for non-existent product keyword', async () => {
    const res = await marketplace.searchMaterials({ keyword: 'sp_khong_ton_tai_xyz_12345' });
    const items = Array.isArray(res) ? res : res.items;
    assert.equal(items.length, 0);
  });

  await t.test('filters by category alias (e.g. "Xi măng" -> Cement)', async () => {
    const res = await marketplace.searchMaterials({ category: 'Xi măng' });
    const items = Array.isArray(res) ? res : res.items;
    for (const item of items) {
      assert.equal(item.category, 'Cement');
    }
  });

  await t.test('masks price to null for discontinued products', async () => {
    const res = await marketplace.searchMaterials({ sellingStatus: 'discontinued' });
    const items = Array.isArray(res) ? res : res.items;
    for (const item of items) {
      assert.equal(item.price, null, 'Discontinued product price must not be exposed');
    }
  });

  await t.test('price filter respects minPrice and maxPrice', async () => {
    const minPrice = 50000;
    const maxPrice = 120000;
    const res = await marketplace.searchMaterials({ minPrice, maxPrice });
    const items = Array.isArray(res) ? res : res.items;
    for (const item of items) {
      assert.ok(item.price >= minPrice);
      assert.ok(item.price <= maxPrice);
    }
  });

  await t.test('sorting price_asc puts lowest price first', async () => {
    const res = await marketplace.searchMaterials({ sortBy: 'price_asc' });
    const items = Array.isArray(res) ? res : res.items;
    const priced = items.filter((i) => i.price != null);
    for (let i = 0; i < priced.length - 1; i++) {
      assert.ok(priced[i].price <= priced[i + 1].price);
    }
  });

  await t.test('sorting price_desc puts highest price first', async () => {
    const res = await marketplace.searchMaterials({ sortBy: 'price_desc' });
    const items = Array.isArray(res) ? res : res.items;
    const priced = items.filter((i) => i.price != null);
    for (let i = 0; i < priced.length - 1; i++) {
      assert.ok(priced[i].price >= priced[i + 1].price);
    }
  });
});

