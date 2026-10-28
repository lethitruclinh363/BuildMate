const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listingOf, saleStateOf, purchaseBlock, publicPriceVisible } = require('../utils/material-sale');
const { DEPOSIT_RATE, summarizeMaterialCheckout } = require('../utils/material-checkout');
const {
  PLATFORM_FEE_RATE,
  DEPOSIT_RATE: ORDER_DEPOSIT_RATE,
  priceMaterialOrder,
  MATERIAL_ORDER_STATUS,
  assertMaterialStatusTransition,
  MATERIAL_ACTOR,
} = require('../utils/material-order.rules');
const { snapshotMaterialFree, isLegacyMaterialOrder } = require('../utils/contractor-finance');
const { checkoutQuoteSchema } = require('../validators/material-checkout.validator');
const { createMaterialOrderSchema } = require('../validators/material-order.validator');
const {
  replayFingerprint,
  isReplayOf,
  REPLAY_WINDOW_MS,
} = require('../services/material-order.service');
const { testDatabaseReady } = require('./helpers/pg-cleanup');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

const policy = {
  deliveryEnabled: true,
  serviceRadiusKm: 10,
  baseDeliveryFee: 30000,
  freeDeliveryRadiusKm: 2,
  deliveryFeePerKm: 8000,
  minimumOrderAmount: 200000,
};

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

describe('Flow 08 COD 0% fee and server pricing', () => {
  it('prices goods plus shipping with no deposit and no platform fee', () => {
    assert.equal(DEPOSIT_RATE, 0);
    assert.equal(ORDER_DEPOSIT_RATE, 0);
    assert.equal(PLATFORM_FEE_RATE, 0);
    const quote = summarizeMaterialCheckout({ policy, distanceKm: 7, materialSubtotal: 2_000_000 });
    const priced = priceMaterialOrder(quote);
    assert.equal(quote.ok, true);
    assert.equal(quote.depositAmount, 0);
    assert.equal(priced.ok, true);
    assert.equal(priced.totalAmount, 2_070_000);
    assert.equal(priced.shippingFee, 70_000);
    assert.equal(priced.depositAmount, 0);
    assert.equal(priced.platformFeeAmount, 0);
    assert.equal(priced.storeDepositAmount, 0);
    assert.equal(priced.remainingAmount, 2_070_000);
    assert.equal(priced.paymentMethod, 'COD');
    const free = snapshotMaterialFree({ materialSubtotal: 2_000_000, shippingFee: 100_000 });
    assert.equal(free.platformFeeAmount, 0);
    assert.equal(isLegacyMaterialOrder({ depositRateSnapshot: 0, depositAmount: 0 }), false);
  });

  it('rejects client money on quote and create payloads', () => {
    const quote = checkoutQuoteSchema.safeParse({
      storeId: '64b000000000000000000001',
      address: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      items: [{ materialId: '64b000000000000000000002', quantity: 2, price: 1 }],
      orderTotal: 0,
    });
    const create = createMaterialOrderSchema.safeParse({
      storeId: '64b000000000000000000001',
      deliveryAddress: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      locationConfirmed: true,
      items: [{ materialId: '64b000000000000000000002', quantity: 2 }],
      totalAmount: 1,
      shippingFee: 0,
    });
    assert.equal(quote.success, false);
    assert.equal(create.success, false);
  });

  it('blocks empty carts, zero quantity, and unconfirmed delivery', () => {
    const empty = createMaterialOrderSchema.safeParse({
      storeId: '64b000000000000000000001',
      deliveryAddress: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      locationConfirmed: true,
      items: [],
    });
    const qty = checkoutQuoteSchema.safeParse({
      storeId: '64b000000000000000000001',
      address: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      items: [{ materialId: '64b000000000000000000002', quantity: 0 }],
    });
    const unconfirmed = createMaterialOrderSchema.safeParse({
      storeId: '64b000000000000000000001',
      deliveryAddress: 'Ninh Kieu, Can Tho',
      lat: 10.03,
      lng: 105.77,
      locationConfirmed: false,
      items: [{ materialId: '64b000000000000000000002', quantity: 1 }],
    });
    assert.equal(empty.success, false);
    assert.equal(qty.success, false);
    assert.equal(unconfirmed.success, false);
  });
});

describe('Flow 08 checkout guards', () => {
  it('requires a visible LIVE store on both quote and create and checks purchaseBlock', () => {
    const checkout = readBe('services/material-checkout.service.js');
    const orders = readBe('services/material-order.service.js');
    assert.match(checkout, /purchaseBlock/);
    assert.match(checkout, /Not enough stock for this order/);
    assert.match(checkout, /if \(!readiness\.visible\)/);
    assert.match(checkout, /prepare\(body, \{ requireLive: true \}\)/);
    assert.match(orders, /requireLive: true/);
    assert.match(orders, /PENDING_CONFIRMATION/);
    assert.match(orders, /paymentMethod: 'COD'/);
    assert.doesNotMatch(orders, /escrowService/);
    assert.doesNotMatch(orders, /PAYMENT_TYPE\.DEPOSIT/);
    assert.doesNotMatch(orders, /material\.stock\s*[-=]/);
  });

  it('returns the recent identical checkout instead of creating a second order', () => {
    const body = {
      storeId: '64b000000000000000000001',
      deliveryAddress: 'Ninh Kieu, Can Tho',
      lat: 10.045119,
      lng: 105.746221,
      customerNote: 'Morning delivery',
      items: [
        { materialId: '64b000000000000000000002', quantity: 2 },
        { materialId: '64b000000000000000000003', quantity: 1 },
      ],
    };
    const same = replayFingerprint('cust-1', body);
    const merged = replayFingerprint('cust-1', {
      ...body,
      items: [
        { materialId: '64b000000000000000000002', quantity: 1 },
        { materialId: '64b000000000000000000002', quantity: 1 },
        { materialId: '64b000000000000000000003', quantity: 1 },
      ],
    });
    const otherNote = replayFingerprint('cust-1', { ...body, customerNote: 'Afternoon' });
    assert.equal(same, merged);
    assert.notEqual(same, otherNote);
    assert.ok(REPLAY_WINDOW_MS >= 30 * 1000);
    const recent = {
      storeId: body.storeId,
      deliveryAddress: body.deliveryAddress,
      items: body.items,
      createdAt: new Date(),
    };
    assert.equal(isReplayOf(recent, body), true);
    const stale = { ...recent, createdAt: new Date(Date.now() - REPLAY_WINDOW_MS - 1000) };
    assert.equal(isReplayOf(stale, body), false);
  });

  it('lets the store confirm a COD order and blocks skip or reverse moves', () => {
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition(
        MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
        MATERIAL_ORDER_STATUS.CONFIRMED,
        MATERIAL_ACTOR.STORE
      )
    );
    assert.doesNotThrow(() =>
      assertMaterialStatusTransition(
        MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
        MATERIAL_ORDER_STATUS.CANCELLED,
        MATERIAL_ACTOR.CUSTOMER
      )
    );
    assert.throws(
      () =>
        assertMaterialStatusTransition(
          MATERIAL_ORDER_STATUS.PENDING_CONFIRMATION,
          MATERIAL_ORDER_STATUS.DELIVERING,
          MATERIAL_ACTOR.STORE
        ),
      (err) => err.statusCode === 409
    );
    assert.throws(
      () =>
        assertMaterialStatusTransition(
          MATERIAL_ORDER_STATUS.CONFIRMED,
          MATERIAL_ORDER_STATUS.CANCELLED,
          MATERIAL_ACTOR.CUSTOMER
        ),
      (err) => err.statusCode === 403
    );
  });
});

describe('Flow 08 frontend catalog, cart and checkout', () => {
  it('hides discontinued public prices and keeps owner prices', () => {
    const sale = readFe('lib/material-sale.ts');
    const explore = readFe('pages/customer/ExplorePage.tsx');
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

  it('stores the cart locally, blocks add-to-cart when not selling, and re-quotes on the server', () => {
    const cart = readFe('features/material-cart/material-cart.store.ts');
    const add = readFe('features/material-cart/AddToMaterialCart.tsx');
    const checkout = readFe('pages/customer/MaterialCheckoutPage.tsx');
    const api = readFe('lib/material-checkout-api.ts');
    assert.match(cart, /name: 'buildmate-material-cart'/);
    assert.match(cart, /return 'unavailable'/);
    assert.match(cart, /needs-switch/);
    assert.match(add, /purchasable\(material\) && sellable/);
    assert.match(add, /disabled=\{!canBuy\}/);
    assert.match(checkout, /submitting/);
    assert.match(checkout, /materialOrderApi\.create/);
    assert.match(checkout, /cart\.codHint/);
    assert.match(api, /Price, distance, and shipping are recalculated on the server/);
    assert.match(api, /items: Array<\{ materialId: string; quantity: number \}>/);
    const draft = api.slice(api.indexOf('MaterialCheckoutDraft'), api.indexOf('MaterialCheckoutLine'));
    assert.doesNotMatch(draft, /price/);
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
  it('rejects unauthenticated quote, checkout and foreign order reads', async (t) => {
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
    assert.equal(quote.status, 401);
    assert.equal(create.status, 401);
    assert.equal(mine.status, 401);
  });
});

describe('Flow 08 isolated Postgres journeys', () => {
  it('skips live checkout HTTP when the isolated test database is down', async (t) => {
    if (testDatabaseReady()) {
      t.skip('Covered by material-checkout and material-order HTTP when isolated Postgres is up');
      return;
    }
    t.skip('PostgreSQL test database is not available');
  });
});
