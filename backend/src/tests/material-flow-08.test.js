const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listingOf, saleStateOf, purchaseBlock, publicPriceVisible } = require('../utils/material-sale');
const { snapshotMaterialFree, isLegacyMaterialOrder } = require('../utils/contractor-finance');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Flow 08 sale states', () => {
  it('maps ACTIVE stock, out of stock, paused listing, and discontinued', () => {
    assert.equal(saleStateOf({ listingStatus: 'ACTIVE', stock: 8 }), 'selling');
    assert.equal(saleStateOf({ listingStatus: 'ACTIVE', stock: 0 }), 'out');
    assert.equal(saleStateOf({ listingStatus: 'ACTIVE', stock: 4, saleAvailability: 'MANUALLY_UNAVAILABLE' }), 'out');
    assert.equal(saleStateOf({ listingStatus: 'PAUSED', stock: 12 }), 'paused');
    assert.equal(saleStateOf({ listingStatus: 'DISCONTINUED', stock: 12 }), 'discontinued');
    assert.equal(listingOf({ isActive: false }), 'PAUSED');
    assert.equal(purchaseBlock({ listingStatus: 'ACTIVE', stock: 8 }), '');
    assert.match(purchaseBlock({ listingStatus: 'ACTIVE', stock: 0 }), /out of stock/i);
    assert.match(purchaseBlock({ listingStatus: 'PAUSED', stock: 9 }), /paused/i);
    assert.match(purchaseBlock({ listingStatus: 'DISCONTINUED', stock: 9 }), /discontinued/i);
    assert.equal(publicPriceVisible({ listingStatus: 'ACTIVE', stock: 0 }), true);
    assert.equal(publicPriceVisible({ listingStatus: 'PAUSED', stock: 4 }), true);
    assert.equal(publicPriceVisible({ listingStatus: 'DISCONTINUED', stock: 4 }), false);
  });
});

describe('Flow 08 material request replaces checkout', () => {
  it('keeps repair finance distinct from discontinued material purchase totals', () => {
    const free = snapshotMaterialFree({ materialSubtotal: 2_000_000, shippingFee: 100_000 });
    assert.equal(free.platformFeeAmount, 0);
    assert.equal(isLegacyMaterialOrder({ depositRateSnapshot: 0, depositAmount: 0 }), false);
  });

  it('deletes checkout and material-order create runtime', () => {
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'services/material-checkout.service.js')), false);
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'services/material-order.service.js')), false);
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'routes/material-checkout.routes.js')), false);
    assert.equal(fs.existsSync(path.join(BACKEND_ROOT, 'routes/material-order.routes.js')), false);
    assert.doesNotMatch(readBe('routes/index.js'), /material-checkout|material-orders/);
  });
});

describe('Flow 08 frontend catalog, cart and checkout', () => {
  it('hides discontinued public prices and keeps owner prices', () => {
    const sale = readFe('lib/material-sale.ts');
    const explore = readFe('features/map/components/MaterialExplorer.tsx');
    const detail = readFe('pages/public/PublicMaterialPage.tsx');
    const store = readFe('pages/public/StorePublicPage.tsx');
    const showcase = readFe('pages/public/StoreProfileShowcase.tsx');
    const owner = readFe('pages/store/StoreMaterialsPage.tsx');
    assert.match(sale, /export function publicPriceVisible/);
    assert.match(explore, /publicPriceVisible\(m\)/);
    assert.match(detail, /publicPriceVisible\(item\)/);
    assert.match(store, /publicPriceVisible\(m\)/);
    assert.match(showcase, /preview \|\| publicPriceVisible\(item\)/);
    assert.match(owner, /vnd\(item\.price\)/);
  });

  it('replaces add-to-cart with a direct material request and unmounts checkout', () => {
    const request = readFe('features/material-request/RequestMaterialsButton.tsx');
    const app = readFe('App.tsx');
    const routes = readBe('routes/index.js');
    assert.match(request, /materialRequirementApi\.createDirect/);
    assert.match(request, /materialRequest\.cta/);
    assert.doesNotMatch(request, /useMaterialCartStore|materialOrderApi/);
    assert.match(app, /Navigate to="\/explore" replace/);
    assert.doesNotMatch(app, /MaterialCartPage|MaterialCheckoutPage/);
    assert.doesNotMatch(routes, /material-checkout|material-orders/);
    assert.equal(fs.existsSync(path.join(FRONTEND_ROOT, 'features/material-cart/material-cart.store.ts')), false);
  });

  it('uploads product photos to the public store scope, not private verification files', () => {
    const page = readFe('pages/store/StoreMaterialsPage.tsx');
    const field = readFe('pages/store/DeviceImageField.tsx');
    const productUrl = readFe('lib/partner-api.ts');
    assert.match(page, /\/uploads\/stores/);
    assert.match(field, /image\/png,image\/jpeg,image\/webp/);
    assert.match(productUrl, /startsWith\('private:'\)/);
    assert.match(productUrl, /startsWith\('\/uploads\/'\)/);
  });
});

describe('Flow 08 HTTP auth when API is up', () => {
  it('does not expose checkout or material-order HTTP paths', async (t) => {
    const origin = process.env.BUILDMATE_API_ORIGIN || 'http://127.0.0.1:5000';
    try {
      const health = await fetch(`${origin}/api/health`);
      if (!health.ok) {
        t.skip('API is not reachable');
        return;
      }
    } catch {
      t.skip('API is not reachable');
      return;
    }
    const quote = await fetch(`${origin}/api/material-checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: '000000000000000000000000',
        address: 'Ninh Kieu, Can Tho',
        lat: 10.03,
        lng: 105.77,
        items: [{ materialId: '000000000000000000000001', quantity: 1 }],
      }),
    });
    const create = await fetch(`${origin}/api/material-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: '000000000000000000000000',
        deliveryAddress: 'Ninh Kieu, Can Tho',
        lat: 10.03,
        lng: 105.77,
        locationConfirmed: true,
        items: [{ materialId: '000000000000000000000001', quantity: 1 }],
      }),
    });
    const mine = await fetch(`${origin}/api/material-orders/000000000000000000000000`);
    assert.equal(quote.status, 404);
    assert.equal(create.status, 404);
    assert.equal(mine.status, 404);
  });
});

describe('Flow 08 isolated Postgres journeys', () => {
  it('skips live checkout HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Material purchase HTTP is unmounted; no replacement checkout journey');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
