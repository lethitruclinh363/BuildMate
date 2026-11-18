const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MRL_STATUS,
  canEditItems,
  canSend,
  canCancel,
  canQuote,
  canConfirmQuote,
  canAdvanceFulfillment,
  nextFulfillment,
  isFulfillmentStatus,
  assertItem,
  assertContractorItem,
  quoteTotal,
} = require('../utils/material-requirement.rules');
const {
  createListSchema,
  itemBody,
  contractorItemBody,
  createQuoteSchema,
  fulfillmentSchema,
} = require('../validators/material-requirement.validator');
const { parseMrlChat, encodeMrlChat, requestPayload, quotePayload } = require('../utils/mrl-chat');
const { matchesRequirementItem } = require('../utils/material-requirement-matching');
const { assertDevDatabaseUrl } = require('../utils/dev-database-guard');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Material requirement catalog matching', () => {
  it('matches normalized product name, specification, and unit', () => {
    assert.equal(
      matchesRequirementItem(
        { name: 'Ống PVC', specification: 'Phi 20', unit: 'Mét' },
        { name: 'Ống PVC Phi 20', description: 'Ống nhựa xây dựng', unit: 'mét' }
      ),
      true
    );
  });

  it('does not count description-only, wrong-specification, or wrong-unit matches', () => {
    const requirement = { name: 'Gạch ống', specification: '8x18', unit: 'viên' };
    assert.equal(
      matchesRequirementItem(requirement, {
        name: 'Keo dán gạch',
        description: 'Dùng để dán gạch ống kích thước 8x18',
        unit: 'viên',
      }),
      false
    );
    assert.equal(matchesRequirementItem(requirement, { name: 'Gạch ống 8x20', unit: 'viên' }), false);
    assert.equal(matchesRequirementItem(requirement, { name: 'Gạch ống 8x18', unit: 'thùng' }), false);
  });
});

describe('Material Requirement List rules', () => {
  it('only edits items in DRAFT and requires items before send', () => {
    assert.equal(canEditItems(MRL_STATUS.DRAFT), true);
    assert.equal(canEditItems(MRL_STATUS.SENT), false);
    assert.equal(canSend(MRL_STATUS.DRAFT, 0), false);
    assert.equal(canSend(MRL_STATUS.DRAFT, 1), true);
    assert.equal(canSend(MRL_STATUS.SENT, 2), false);
    assert.equal(canCancel(MRL_STATUS.SENT), true);
    assert.equal(canCancel(MRL_STATUS.CONFIRMED), true);
    assert.equal(canCancel(MRL_STATUS.QUOTED), false);
    assert.equal(canCancel(MRL_STATUS.PREPARING), false);
    assert.equal(canQuote(MRL_STATUS.SENT), true);
    assert.equal(canConfirmQuote(MRL_STATUS.QUOTED, 'SENT'), true);
    assert.equal(canConfirmQuote(MRL_STATUS.SENT, 'SENT'), false);
  });

  it('advances store fulfillment one step at a time', () => {
    assert.equal(nextFulfillment(MRL_STATUS.CONFIRMED), MRL_STATUS.PREPARING);
    assert.equal(nextFulfillment(MRL_STATUS.PREPARING), MRL_STATUS.DELIVERING);
    assert.equal(nextFulfillment(MRL_STATUS.DELIVERING), MRL_STATUS.DELIVERED);
    assert.equal(nextFulfillment(MRL_STATUS.DELIVERED), null);
    assert.equal(canAdvanceFulfillment(MRL_STATUS.CONFIRMED, MRL_STATUS.PREPARING), true);
    assert.equal(canAdvanceFulfillment(MRL_STATUS.CONFIRMED, MRL_STATUS.DELIVERED), false);
    assert.equal(isFulfillmentStatus(MRL_STATUS.CONFIRMED), true);
    assert.equal(isFulfillmentStatus(MRL_STATUS.QUOTED), false);
  });

  it('rejects invalid item payloads and totals quote lines', () => {
    assert.throws(() => assertItem({ name: 'A', quantity: 1 }), /name is invalid/);
    assert.throws(() => assertItem({ name: 'Cement', quantity: 0 }), /greater than 0/);
    const item = assertItem({ name: 'Cement PCB40', specification: '50kg', unit: 'bao', quantity: 2 });
    assert.equal(item.name, 'Cement PCB40');
    assert.equal(quoteTotal([{ quantity: 2, unitPrice: 100000 }], 50000), 250000);
    assert.equal(quoteTotal([{ availableQty: 3, quantity: 2, unitPrice: 100000 }], 0), 300000);
  });

  it('requires a unit for contractor material lines and limits quantity precision', () => {
    const valid = { name: 'PVC pipe', specification: '20mm', unit: 'meter', quantity: 1.125 };
    assert.equal(assertContractorItem(valid).unit, 'meter');
    assert.throws(() => assertContractorItem({ ...valid, unit: '' }), /Unit is required/);
    assert.throws(() => contractorItemBody.parse({ ...valid, unit: '' }));
    assert.throws(() => contractorItemBody.parse({ ...valid, quantity: 1.1234 }));
    assert.equal(contractorItemBody.parse({ ...valid, quantity: '1.125' }).quantity, 1.125);
  });

  it('strips a mistaken leading quantity from the unit without changing quantity', () => {
    const { normalizeMrlUnit } = require('../utils/material-requirement.rules');
    assert.equal(normalizeMrlUnit('1 ống'), 'ống');
    assert.equal(normalizeMrlUnit('2.5 mét'), 'mét');
    assert.equal(normalizeMrlUnit('ống'), 'ống');
    assert.equal(normalizeMrlUnit('PVC 20'), 'PVC 20');
    const cleaned = assertItem({ name: 'Ong nuoc nhua', quantity: 5, unit: '1 ống' });
    assert.equal(cleaned.unit, 'ống');
    assert.equal(cleaned.quantity, 5);
  });

  it('formats quantity beside unit and keeps an empty specification empty', () => {
    const {
      formatQtyWithUnit,
      formatMrlSpec,
      mrlIndex,
      unitLooksLikeQuantity,
    } = require('../utils/material-requirement.rules');
    assert.equal(formatQtyWithUnit(4, 'ống'), '4 ống');
    assert.equal(formatQtyWithUnit(4, '1 ống'), '4 ống');
    assert.equal(formatQtyWithUnit(3, 'bao'), '3 bao');
    assert.equal(formatQtyWithUnit(4, ''), '4');
    assert.equal(formatQtyWithUnit(null, 'ống'), '');
    assert.equal(formatMrlSpec('PVC, dài 4m'), 'PVC, dài 4m');
    assert.equal(formatMrlSpec(''), '');
    assert.equal(formatMrlSpec(null), '');
    assert.equal(mrlIndex(0), '01');
    assert.equal(mrlIndex(11), '12');
    assert.equal(unitLooksLikeQuantity('1 ống'), true);
    assert.equal(unitLooksLikeQuantity('ống'), false);
    assert.equal(unitLooksLikeQuantity('PVC 20'), false);
  });
});

describe('Material Requirement List validation', () => {
  it('rejects empty create and incomplete store quotes', () => {
    assert.throws(() => createListSchema.parse({ requestId: 'short' }));
    const parsed = createListSchema.parse({ requestId: '507f1f77bcf86cd799439011', items: [] });
    assert.equal(parsed.requestId.length > 8, true);
    assert.throws(() => itemBody.parse({ name: 'X', quantity: 1 }));
    assert.throws(() => createQuoteSchema.parse({ items: [] }));
    assert.throws(() => fulfillmentSchema.parse({ status: 'CONFIRMED' }));
    assert.equal(fulfillmentSchema.parse({ status: 'PREPARING' }).status, 'PREPARING');
    assert.throws(() => createQuoteSchema.parse({
      items: [{ itemId: '1', unitPrice: 1000, availableQty: -1 }],
    }));
    const unavailable = createQuoteSchema.parse({
      items: [{ itemId: '1', unitPrice: 0, availableQty: 0 }],
    });
    assert.equal(unavailable.items[0].availableQty, 0);
  });
});

describe('Material Requirement List chat cards', () => {
  it('encodes a TEXT payload that chat can parse without a new message type', () => {
    const encoded = encodeMrlChat(requestPayload({
      id: 'list-1',
      requestId: 'req-1',
      requestTitle: 'Fix roof',
      siteAddress: 'Can Tho',
      items: [{ name: 'Cement', specification: 'PCB40', unit: 'bao', quantity: 10 }],
    }), 'Material quote request');
    const parsed = parseMrlChat(encoded);
    assert.equal(parsed.kind, 'MRL_REQUEST');
    assert.equal(parsed.listId, 'list-1');
    assert.equal(parsed.items[0].name, 'Cement');
    const cleaned = parseMrlChat(encodeMrlChat(requestPayload({
      id: 'list-2',
      requestId: 'req-2',
      items: [{ name: 'Ong nuoc', specification: '', unit: '1 ống', quantity: 5 }],
    }), 'Material list'));
    assert.equal(cleaned.items[0].unit, 'ống');
    assert.equal(cleaned.items[0].quantity, 5);
    const quoted = parseMrlChat(encodeMrlChat(quotePayload({
      id: 'list-1',
      storeName: 'Yard',
    }, {
      deliveryFee: 20000,
      items: [{ name: 'Cement', availableQty: 8, unitPrice: 100000, unit: 'bao' }],
    }, 820000), 'Material quote'));
    assert.equal(quoted.kind, 'MRL_QUOTE');
    assert.equal(quoted.total, 820000);
    const loose = parseMrlChat('Material list 723c735f16e2badc3874517e - Ống Phi 20 | 11 ống - Ống nước nhựa | 5 mét');
    assert.equal(loose.kind, 'MRL_REQUEST');
    assert.equal(loose.listId, '723c735f16e2badc3874517e');
    assert.equal(loose.items[0].name, 'Ống Phi 20');
    assert.equal(loose.items[0].quantity, 11);
  });
});

describe('Material Requirement List source wiring', () => {
  it('mounts contractor and store routes without creating a COD order', () => {
    const routes = readBe('routes/index.js');
    const service = readBe('services/material-requirement.service.js');
    const app = readFe('App.tsx');
    assert.match(routes, /material-requirements/);
    assert.match(service, /Only contractors can create a material requirement list/);
    assert.match(service, /Only the customer can send a material list to a store/);
    assert.match(service, /Only the customer can save this material list/);
    assert.match(service, /Only the customer can confirm a material quote/);
    assert.match(service, /Only the customer can reject a material quote/);
    assert.doesNotMatch(service, /Customers cannot manage material requirement lists/);
    assert.doesNotMatch(service, /createMaterialOrder|material-checkout/);
    assert.match(readBe('routes/materialRequirementRoutes.js'), /eligible-stores/);
    assert.match(readBe('services/material-requirement.service.js'), /assertApprovedLiveStore/);
    assert.match(readBe('controllers/materialRequirementController.js'), /eligibleStores/);
    assert.match(app, /contractor\/material-requirements/);
    assert.match(app, /customer\/material-lists/);
    assert.match(app, /store\/material-requests/);
    assert.match(readBe('routes/materialRequirementRoutes.js'), /\/direct/);
    assert.match(service, /Only customers can send a direct material request/);
    assert.match(service, /Material delivery tracking is no longer available/);
    assert.match(service, /isFulfillmentStatus\(list\.status\)/);
    assert.doesNotMatch(readFe('pages/contractor/ContractorMaterialRequirementPage.tsx'), /fulfill\(/);
    assert.doesNotMatch(readFe('pages/store/StoreMaterialRequestDetailPage.tsx'), /\.fulfill\(/);
    assert.doesNotMatch(readFe('pages/contractor/ContractorMaterialRequirementPage.tsx'), /id="mrl-store"/);
    assert.doesNotMatch(readFe('pages/customer/CustomerMaterialListPage.tsx'), /mrl-store-\$/);
    assert.match(readFe('pages/customer/CustomerMaterialListPage.tsx'), /mrl-choose-store-map/);
    assert.match(readFe('pages/customer/ExplorePage.tsx'), /uniqueById/);
    assert.match(readFe('pages/customer/ExplorePage.tsx'), /search\.get\('mrl'\)/);
    assert.match(readFe('pages/customer/CustomerMaterialListPage.tsx'), /\?mrl=/);
    assert.match(readFe('features/map/components/ExplorePopup.tsx'), /contactStore/);
    assert.match(readFe('pages/chat/ChatPage.tsx'), /MaterialChatCard/);
    assert.match(readFe('pages/chat/ChatPage.tsx'), /parseMrlChat/);
    assert.match(readFe('pages/chat/ChatPage.tsx'), /MaterialListPicker/);
    assert.match(readFe('pages/customer/CustomerQuotationPage.tsx'), /mrl\.saveList/);
    assert.match(readFe('pages/customer/CustomerQuotationPage.tsx'), /mrl\.findNearby/);
    assert.match(readFe('features/chat/components/MaterialChatCard.tsx'), /mrl\.advisoryQuoteHint/);
    assert.match(readBe('routes/materialRequirementRoutes.js'), /:id\/save/);
    assert.match(readBe('routes/materialRequirementRoutes.js'), /:id\/reject/);
    assert.match(readBe('repositories/materialRequirement.postgres.js'), /ensureCustomerSaveSchema/);
    assert.match(readBe('repositories/materialRequirement.postgres.js'), /cloneList/);
    assert.match(service, /emitMrlUpdate/);
    assert.match(readBe('services/chatService.js'), /parseMrlChat\(content\)/);
    assert.match(readBe('utils/mrl-chat.js'), /\[\[BM:MRL\]\]/);
    assert.match(readBe('repositories/materialRequirement.postgres.js'), /ensureFulfillmentConstraint/);
    assert.match(service, /postStoreChat/);
    assert.match(readFe('pages/store/StoreDashboard.jsx'), /store\/material-requests/);
    assert.match(readFe('features/material-request/RequestMaterialsButton.tsx'), /materialRequirementApi\.createDirect/);
    assert.doesNotMatch(readBe('routes/index.js'), /material-checkout/);
    assert.doesNotMatch(readBe('routes/index.js'), /material-orders/);
    assert.match(readFe('pages/contractor/CreateQuotationPage.tsx'), /materialRequirementApi\.create/);
    assert.match(readFe('pages/contractor/CreateQuotationPage.tsx'), /quotationApi\.create/);
    assert.doesNotMatch(readFe('pages/contractor/CreateQuotationPage.tsx'), /material-requirements\/new/);
  });

  it('keeps specification, unit, and quantity as separate fields', () => {
    const helper = readFe('lib/mrl-display.ts');
    const page = readFe('pages/contractor/CreateQuotationPage.tsx');
    const lines = readFe('components/mrl/MaterialItemLines.tsx');
    const repo = readBe('repositories/materialRequirement.postgres.js');
    assert.match(helper, /export function normalizeMrlUnit/);
    assert.match(helper, /export function formatQtyWithUnit/);
    assert.match(helper, /export function formatMrlSpec/);
    assert.match(helper, /export function mrlIndex/);
    assert.match(helper, /export function unitLooksLikeQuantity/);
    assert.doesNotMatch(helper, /dashBlank\(row\.specification\) \} · /);
    assert.match(page, /mrlIndex\(/);
    assert.match(page, /formatMrlSpec\(row\.specification\)/);
    assert.match(page, /mrl\.specMissing/);
    assert.match(page, /mrl\.stt/);
    assert.match(page, /unitLooksLikeQuantity/);
    assert.match(page, /mrl\.spec/);
    assert.match(page, /mrl\.unitLabel/);
    assert.match(page, /mrl\.unitPh/);
    assert.doesNotMatch(page, /quote\.mrlInfo/);
    assert.doesNotMatch(page, /mrl\.unitFallback/);
    assert.doesNotMatch(page, /formatMrlMeta/);
    assert.match(repo, /unit: normalizeMrlUnit\(row\.unit\)/);
    assert.match(lines, /formatQtyWithUnit/);
    assert.match(lines, /mrl\.specMissing/);
    assert.match(readFe('pages/customer/CustomerQuotationPage.tsx'), /MaterialItemLines/);
    assert.match(readFe('pages/customer/CustomerQuotationPage.tsx'), /mrl\.kindCount/);
    assert.match(readFe('pages/customer/CustomerQuotationPage.tsx'), /mrl\.saveList/);
    assert.match(readFe('pages/customer/CustomerQuotationPage.tsx'), /mrl\.findNearby/);
    assert.doesNotMatch(readFe('pages/customer/CustomerQuotationPage.tsx'), /formatMrlMeta/);
    assert.doesNotMatch(readFe('pages/customer/CustomerMaterialListPage.tsx'), /formatMrlMeta/);
    assert.doesNotMatch(readFe('pages/store/StoreMaterialRequestDetailPage.tsx'), /formatMrlMeta/);
    assert.doesNotMatch(readFe('pages/store/StoreMaterialRequestDetailPage.tsx'), /mrl\.noSpec/);
    assert.match(readFe('pages/store/StoreMaterialRequestDetailPage.tsx'), /MaterialItemLines|formatQtyWithUnit/);
  });

  it('updates a DRAFT material list in place instead of creating a second list', () => {
    const service = readBe('services/material-requirement.service.js');
    const repo = readBe('repositories/materialRequirement.postgres.js');
    assert.match(service, /canEditItems\(existing\.status\)/);
    assert.match(service, /replaceItems/);
    assert.match(service, /withLock\(`mrl:/);
    assert.match(repo, /function replaceItems/);
    assert.match(repo, /DELETE FROM material_requirement_items WHERE list_id/);
    assert.doesNotMatch(service, /createList[\s\S]{0,1200}sendToStore\(/);
  });

  it('keeps repair finance ratios untouched', () => {
    const finance = readBe('utils/contractor-finance.js');
    assert.match(finance, /DEPOSIT_RATE\s*=\s*0\.15/);
    assert.match(finance, /PLATFORM_FEE_RATE\s*=\s*0\.05/);
  });
});

describe('Material Requirement List database guard', () => {
  it('refuses group BuilMate, demo BuilMate_test, and port 55432', () => {
    assert.throws(
      () => assertDevDatabaseUrl('postgresql://u:p@127.0.0.1:5432/BuilMate'),
      /Refusing/
    );
    assert.throws(
      () => assertDevDatabaseUrl('postgresql://u:p@127.0.0.1:55432/BuilMate_test'),
      /Refusing/
    );
    assert.throws(
      () => assertDevDatabaseUrl('postgresql://u:p@127.0.0.1:55433/BuilMate_test'),
      /Refusing|BuilMate_dev/
    );
    const ok = assertDevDatabaseUrl('postgresql://u:p@127.0.0.1:55433/BuilMate_dev');
    assert.match(ok, /55433/);
  });

  it('expands MRL fulfillment statuses without dropping quote history', () => {
    const sql18 = fs.readFileSync(path.resolve(__dirname, '../../scripts/dev-db/18-material-requirement.sql'), 'utf8');
    const sql21 = fs.readFileSync(path.resolve(__dirname, '../../scripts/dev-db/21-mrl-fulfillment.sql'), 'utf8');
    const sql23 = fs.readFileSync(path.resolve(__dirname, '../../scripts/dev-db/23-mrl-customer-save.sql'), 'utf8');
    const sql24 = fs.readFileSync(path.resolve(__dirname, '../../scripts/dev-db/24-mrl-direct-request.sql'), 'utf8');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    assert.match(sql18, /PREPARING.*DELIVERING.*DELIVERED/s);
    assert.match(sql18, /customer_user_id/);
    assert.match(sql21, /DROP CONSTRAINT IF EXISTS chk_mrl_status/);
    assert.match(sql21, /PREPARING/);
    assert.doesNotMatch(sql21, /DROP TABLE /i);
    assert.match(sql23, /parent_list_id/);
    assert.match(sql23, /DROP INDEX IF EXISTS uq_mrl_active_request/);
    assert.match(sql23, /uq_mrl_parent_store/);
    assert.doesNotMatch(sql23, /DROP TABLE /i);
    assert.match(sql24, /ALTER COLUMN repair_request_id DROP NOT NULL/);
    assert.match(sql24, /customer_user_id/);
    assert.doesNotMatch(sql24, /DROP TABLE /i);
    assert.match(schema, /model material_requirement_lists/);
    assert.match(schema, /repair_request_id BigInt\?/);
    assert.match(readBe('repositories/materialRequirement.postgres.js'), /ensureDirectRequestSchema/);
  });
});

describe('Material Request owner mapping and duplicate guards', () => {
  it('notifies the store owner public user id from stores.owner_user_id', () => {
    const service = readBe('services/material-requirement.service.js');
    const partner = readBe('repositories/partner.postgres.js');
    const repo = readBe('repositories/materialRequirement.postgres.js');
    assert.match(partner, /contractorId: row\.users\?\.legacy_mongo_id/);
    assert.match(partner, /where\.users = \{ legacy_mongo_id: id \}/);
    assert.match(repo, /ow\.legacy_mongo_id AS owner_legacy_id/);
    assert.match(service, /function storeOwnerPublicId/);
    assert.match(service, /store\?\.contractorId \|\| storeRow\?\.owner_legacy_id/);
    assert.match(service, /notifyStoreOfRequest\(store, storeRow, latest\)/);
    assert.match(service, /mrl-request:/);
  });

  it('guards double submit and shows material lines on the store inbox', () => {
    const button = readFe('features/material-request/RequestMaterialsButton.tsx');
    const inbox = readFe('pages/store/StoreMaterialRequestsPage.tsx');
    const detail = readFe('pages/store/StoreMaterialRequestDetailPage.tsx');
    assert.match(button, /submittingRef/);
    assert.match(button, /material\.name/);
    assert.match(button, /material\.unit/);
    assert.match(inbox, /formatQtyWithUnit/);
    assert.match(inbox, /row\.items\?\.\[0\]/);
    assert.match(inbox, /row\.customerName/);
    assert.doesNotMatch(inbox, /siteAddress \|\| t\('mrl\.noSpec'\)/);
    assert.match(detail, /list\.customerName/);
    assert.match(detail, /MaterialItemLines/);
    assert.match(detail, /deliveryFee: 0/);
    assert.match(detail, /advisoryQuoteHint/);
  });
});

describe('Material Request HTTP auth when API is up', () => {
  it('rejects unauthenticated direct create and unmounted purchase paths', async (t) => {
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

    const unauth = await fetch(`${origin}/api/material-requirements/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: '000000000000000000000000',
        items: [{ name: 'Xi Mang PCB40', quantity: 2, unit: 'Bao' }],
      }),
    });
    assert.equal(unauth.status, 401);

    const invalid = await fetch(`${origin}/api/material-requirements/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: 'abc', items: [] }),
    });
    assert.equal(invalid.status, 401);

    const order = await fetch(`${origin}/api/material-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const pay = await fetch(`${origin}/api/material-checkout/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(order.status, 404);
    assert.equal(pay.status, 404);
  });
});

describe('Material Request isolated Postgres journeys', () => {
  it('lets the owning contractor create and update a material draft for an accepted request', async (t) => {
    const { testDatabaseReady } = require('./helpers/pg-cleanup');
    if (!testDatabaseReady()) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { createParty, cleanupParty } = require('./helpers/party');
    const { startTestServer, api } = require('./helpers/http');
    const server = await startTestServer();
    let party;
    try {
      party = await createParty();
      const missingUnit = await api(server.origin, {
        method: 'POST',
        path: '/api/material-requirements',
        token: party.tokens.contractor,
        body: {
          requestId: String(party.request._id),
          items: [{ name: 'PVC pipe', quantity: 2 }],
        },
      });
      assert.equal(missingUnit.status, 422);

      const created = await api(server.origin, {
        method: 'POST',
        path: '/api/material-requirements',
        token: party.tokens.contractor,
        body: {
          requestId: String(party.request._id),
          items: [{ name: 'PVC pipe', specification: '20mm', unit: 'meter', quantity: 2 }],
        },
      });
      assert.equal(created.status, 201, created.json?.message || JSON.stringify(created.json));
      const list = created.json.data;
      assert.equal(list.status, 'DRAFT');
      assert.equal(list.items.length, 1);
      assert.equal(list.items[0].unit, 'meter');

      const updated = await api(server.origin, {
        method: 'POST',
        path: '/api/material-requirements',
        token: party.tokens.contractor,
        body: {
          requestId: String(party.request._id),
          items: [
            { name: 'PVC pipe', specification: '25mm', unit: 'meter', quantity: 3 },
            { name: 'Elbow connector', unit: 'piece', quantity: 2 },
          ],
        },
      });
      assert.equal(updated.status, 201, updated.json?.message || JSON.stringify(updated.json));
      assert.equal(updated.json.data.id, list.id);
      assert.equal(updated.json.data.items.length, 2);
      assert.equal(updated.json.data.items[0].quantity, 3);

      const invalidAdd = await api(server.origin, {
        method: 'POST',
        path: `/api/material-requirements/${list.id}/items`,
        token: party.tokens.contractor,
        body: { name: 'Sand', quantity: 1 },
      });
      assert.equal(invalidAdd.status, 422);

      const denied = await api(server.origin, {
        path: `/api/material-requirements/${list.id}`,
        token: party.tokens.stranger,
      });
      assert.equal(denied.status, 403);
    } finally {
      await server.close();
      if (party) await cleanupParty(party);
    }
  });

  it('sends a customer request to the owning store, notifies, and opens chat', async (t) => {
    const { testDatabaseReady, deleteFixtureUsers } = require('./helpers/pg-cleanup');
    if (!testDatabaseReady()) {
      t.skip('PostgreSQL test database is not available');
      return;
    }

    const { createUser, ROLES } = require('./helpers/party');
    const { signToken } = require('../services/authService');
    const { startTestServer, api } = require('./helpers/http');
    const { Store, ContractorProfile } = require('../repositories/partnerAccess');
    const { Material } = require('../repositories/offeringAccess');
    const { STORE_STATUS } = require('../models/Store');
    const { VERIFICATION_STATUS } = require('../models/ContractorProfile');
    const { prisma } = require('../config/prisma');
    const { Notification } = require('../repositories/systemAccess');
    const { ChatRoom } = require('../repositories/conversationAccess');

    const stamp = Date.now();
    const ids = [];
    const server = await startTestServer();
    try {
      const customer = await createUser({
        name: 'MRL Direct Customer',
        email: `mrl.direct.customer.${stamp}@buildmate.test`,
        password: 'Demo@1234',
        role: ROLES.CUSTOMER,
      });
      const owner = await createUser({
        name: 'MRL Direct Store',
        email: `mrl.direct.store.${stamp}@buildmate.test`,
        password: 'Demo@1234',
        role: ROLES.MATERIAL_STORE_OWNER,
      });
      const stranger = await createUser({
        name: 'MRL Direct Stranger',
        email: `mrl.direct.stranger.${stamp}@buildmate.test`,
        password: 'Demo@1234',
        role: ROLES.CUSTOMER,
      });
      ids.push(customer._id, owner._id, stranger._id);

      await ContractorProfile.create({
        userId: owner._id,
        businessName: 'Direct Cement Yard',
        verificationStatus: VERIFICATION_STATUS.APPROVED,
      });
      const store = await Store.create({
        contractorId: owner._id,
        name: 'Direct Cement Yard',
        description: 'Catalog store for material requests',
        phone: '0901234567',
        avatar: '/uploads/store.png',
        coverImage: '/uploads/cover.png',
        address: 'Can Tho',
        city: 'Can Tho',
        storeType: 'MATERIALS',
        status: STORE_STATUS.LIVE,
        openingHours: '07:00 – 18:00',
        location: { type: 'Point', coordinates: [105.746, 10.045] },
        locationConfirmed: true,
      });
      await Material.create({
        storeId: store._id,
        contractorId: owner._id,
        name: 'Xi Mang PCB40',
        category: 'Cement',
        unit: 'Bao',
        price: 100000,
        stock: 50,
        isActive: true,
      });

      const customerToken = signToken(customer);
      const ownerToken = signToken(owner);
      const strangerToken = signToken(stranger);

      const invalid = await api(server.origin, {
        method: 'POST',
        path: '/api/material-requirements/direct',
        token: customerToken,
        body: { storeId: store._id, items: [{ name: 'Xi', quantity: 0, unit: 'Bao' }] },
      });
      assert.equal(invalid.status, 422);

      const missingStore = await api(server.origin, {
        method: 'POST',
        path: '/api/material-requirements/direct',
        token: customerToken,
        body: { storeId: '000000000000000000000000', items: [{ name: 'Xi Mang PCB40', quantity: 2, unit: 'Bao' }] },
      });
      assert.ok([404, 409].includes(missingStore.status), `unexpected missing store status ${missingStore.status}`);

      const created = await api(server.origin, {
        method: 'POST',
        path: '/api/material-requirements/direct',
        token: customerToken,
        body: {
          storeId: store._id,
          title: 'Xi Mang PCB40',
          note: 'Can 2 bao giao som',
          items: [{ name: 'Xi Mang PCB40', specification: 'PCB40', unit: 'Bao', quantity: 2, notes: 'Can 2 bao giao som' }],
        },
      });
      assert.equal(created.status, 201, created.json?.message || JSON.stringify(created.json));
      const list = created.json?.data;
      assert.equal(list.customerId, String(customer._id));
      assert.equal(list.storeId, String(store._id));
      assert.equal(list.customerName, 'MRL Direct Customer');
      assert.equal(list.items[0].name, 'Xi Mang PCB40');
      assert.equal(list.items[0].quantity, 2);
      assert.equal(list.items[0].unit, 'Bao');
      assert.ok(!list.requestId);

      const orders = await prisma.material_orders.count({
        where: { customer_user_id: (await prisma.users.findFirst({ where: { legacy_mongo_id: String(customer._id) }, select: { id: true } })).id },
      });
      assert.equal(orders, 0);

      const inbox = await api(server.origin, {
        path: '/api/material-requirements',
        token: ownerToken,
      });
      assert.equal(inbox.status, 200);
      const mine = inbox.json?.data || [];
      assert.equal(mine.some((row) => row.id === list.id), true);
      const shown = mine.find((row) => row.id === list.id);
      assert.equal(shown.customerName, 'MRL Direct Customer');
      assert.equal(shown.items[0].name, 'Xi Mang PCB40');

      const strangerInbox = await api(server.origin, {
        path: `/api/material-requirements/${list.id}`,
        token: strangerToken,
      });
      assert.equal(strangerInbox.status, 403);

      const notices = await Notification.find({ userId: owner._id });
      const noticeRows = Array.isArray(notices) ? notices : await notices;
      const hit = (noticeRows || []).map((row) => row.toPublic?.() || row).find((row) => String(row.link || '').includes(list.id));
      assert.ok(hit, 'store owner did not receive a notification');
      assert.match(String(hit.link), /\/store\/material-requests\//);

      const rooms = await ChatRoom.find({ customerId: customer._id, storeId: store._id });
      const roomList = Array.isArray(rooms) ? rooms : await rooms;
      assert.ok(roomList.length >= 1, 'expected a customer-store chat room');

      const quote = await api(server.origin, {
        method: 'POST',
        path: `/api/material-requirements/${list.id}/quotes`,
        token: ownerToken,
        body: {
          deliveryFee: 0,
          note: 'Gia tu van',
          items: [{ itemId: list.items[0].id, unitPrice: 98000, availableQty: 2, note: 'Bao 50kg' }],
        },
      });
      assert.equal(quote.status, 201, quote.json?.message || JSON.stringify(quote.json));
      assert.equal(quote.json?.data?.status, 'QUOTED');
      assert.equal(Number(quote.json?.data?.quotes?.[0]?.deliveryFee || 0), 0);
      const afterQuoteOrders = await prisma.material_orders.count({
        where: { customer_user_id: (await prisma.users.findFirst({ where: { legacy_mongo_id: String(customer._id) }, select: { id: true } })).id },
      });
      assert.equal(afterQuoteOrders, 0);
    } finally {
      await server.close();
      await deleteFixtureUsers(ids);
    }
  });
});
