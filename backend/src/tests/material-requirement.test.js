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
  assertItem,
  quoteTotal,
} = require('../utils/material-requirement.rules');
const { createListSchema, itemBody, createQuoteSchema } = require('../validators/material-requirement.validator');
const { assertDevDatabaseUrl } = require('../utils/dev-database-guard');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function readBe(rel) {
  return fs.readFileSync(path.join(BACKEND_ROOT, rel), 'utf8');
}

describe('Material Requirement List rules', () => {
  it('only edits items in DRAFT and requires items before send', () => {
    assert.equal(canEditItems(MRL_STATUS.DRAFT), true);
    assert.equal(canEditItems(MRL_STATUS.SENT), false);
    assert.equal(canSend(MRL_STATUS.DRAFT, 0), false);
    assert.equal(canSend(MRL_STATUS.DRAFT, 1), true);
    assert.equal(canSend(MRL_STATUS.SENT, 2), false);
    assert.equal(canCancel(MRL_STATUS.SENT), true);
    assert.equal(canCancel(MRL_STATUS.QUOTED), false);
    assert.equal(canQuote(MRL_STATUS.SENT), true);
    assert.equal(canConfirmQuote(MRL_STATUS.QUOTED, 'SENT'), true);
    assert.equal(canConfirmQuote(MRL_STATUS.SENT, 'SENT'), false);
  });

  it('rejects invalid item payloads and totals quote lines', () => {
    assert.throws(() => assertItem({ name: 'A', quantity: 1 }), /name is invalid/);
    assert.throws(() => assertItem({ name: 'Cement', quantity: 0 }), /greater than 0/);
    const item = assertItem({ name: 'Cement PCB40', specification: '50kg', unit: 'bao', quantity: 2 });
    assert.equal(item.name, 'Cement PCB40');
    assert.equal(quoteTotal([{ quantity: 2, unitPrice: 100000 }], 50000), 250000);
  });
});

describe('Material Requirement List validation', () => {
  it('rejects empty create and incomplete store quotes', () => {
    assert.throws(() => createListSchema.parse({ requestId: 'short' }));
    const parsed = createListSchema.parse({ requestId: '507f1f77bcf86cd799439011', items: [] });
    assert.equal(parsed.requestId.length > 8, true);
    assert.throws(() => itemBody.parse({ name: 'X', quantity: 1 }));
    assert.throws(() => createQuoteSchema.parse({ items: [] }));
  });
});

describe('Material Requirement List source wiring', () => {
  it('mounts contractor and store routes without creating a COD order', () => {
    const routes = readBe('routes/index.js');
    const service = readBe('services/material-requirement.service.js');
    const app = readFe('App.tsx');
    assert.match(routes, /material-requirements/);
    assert.match(service, /Only contractors can create a material requirement list/);
    assert.match(service, /Customers cannot manage material requirement lists/);
    assert.doesNotMatch(service, /createMaterialOrder|material-checkout/);
    assert.match(readBe('routes/materialRequirementRoutes.js'), /eligible-stores/);
    assert.match(readBe('services/material-requirement.service.js'), /assertApprovedLiveStore/);
    assert.match(readBe('controllers/materialRequirementController.js'), /eligibleStores/);
    assert.match(app, /contractor\/material-requirements/);
    assert.match(app, /store\/material-requests/);
    assert.doesNotMatch(readFe('pages/contractor/ContractorMaterialRequirementPage.tsx'), /id="mrl-store"/);
    assert.match(readFe('pages/store/StoreDashboard.jsx'), /store\/material-requests/);
    assert.match(readFe('pages/contractor/ContractorRequestsPage.tsx'), /material-requirements\/new/);
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
});
