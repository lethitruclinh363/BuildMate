const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  evaluateReadiness,
  activationStatusOf,
  isPartnerPubliclyVisible,
} = require('../services/activation.service');
const { STORE_STATUS } = require('../models/Store');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const place = { type: 'Point', coordinates: [105.746, 10.045] };
const approved = { verificationStatus: 'APPROVED' };
const active = { status: 'ACTIVE' };

function contractorStore(status, extra = {}) {
  return {
    name: 'Crew Minh',
    avatar: '/uploads/a.png',
    description: 'Sửa điện nước tại Cần Thơ',
    address: 'Ninh Kieu, Can Tho',
    openingHours: '07:00 – 18:00',
    phone: '0901234567',
    location: place,
    locationConfirmed: true,
    status,
    ...extra,
  };
}

function storefront(status, extra = {}) {
  return {
    name: 'Cai Rang',
    logo: '/uploads/logo.png',
    coverImage: '/uploads/cover.png',
    description: 'Cửa hàng vật liệu xây dựng',
    address: 'Cai Rang, Can Tho',
    openingHours: '07:00 – 18:00',
    phone: '0901234567',
    location: place,
    locationConfirmed: true,
    status,
    ...extra,
  };
}

function checklistMaps() {
  const src = fs.readFileSync(path.join(FRONTEND_ROOT, 'components/partner/checklist-nav.ts'), 'utf8');
  const contractor = {};
  const store = {};
  const contractorBlock = src.slice(src.indexOf('CONTRACTOR_CHECKLIST'), src.indexOf('STORE_CHECKLIST'));
  const storeBlock = src.slice(src.indexOf('STORE_CHECKLIST'), src.indexOf('export function checklistDestination'));
  for (const match of contractorBlock.matchAll(/(\w+):\s*\{\s*route:\s*'([^']+)',\s*hash:\s*'([^']*)'/g)) {
    contractor[match[1]] = { route: match[2], hash: match[3] };
  }
  for (const match of storeBlock.matchAll(/(\w+):\s*\{\s*route:\s*'([^']+)',\s*hash:\s*'([^']*)'/g)) {
    store[match[1]] = { route: match[2], hash: match[3] };
  }
  return { contractor, store };
}

describe('Flow 03 status mapping', () => {
  it('keeps STORE_STATUS values and maps unknown/draft to INACTIVE for display', () => {
    assert.equal(STORE_STATUS.DRAFT, 'DRAFT');
    assert.equal(STORE_STATUS.INACTIVE, 'INACTIVE');
    assert.equal(STORE_STATUS.LIVE, 'LIVE');
    assert.equal(STORE_STATUS.PAUSED, 'PAUSED');
    assert.equal(activationStatusOf(STORE_STATUS.LIVE), 'LIVE');
    assert.equal(activationStatusOf(STORE_STATUS.PAUSED), 'PAUSED');
    assert.equal(activationStatusOf(STORE_STATUS.INACTIVE), 'INACTIVE');
    assert.equal(activationStatusOf(STORE_STATUS.DRAFT), 'INACTIVE');
  });

  it('does not treat APPROVED as publicly visible', () => {
    const result = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('INACTIVE'),
      user: active,
      serviceCount: 1,
    });
    assert.equal(result.verificationStatus, 'APPROVED');
    assert.equal(result.activationStatus, 'INACTIVE');
    assert.equal(result.ready, true);
    assert.equal(result.visible, false);
    assert.equal(
      isPartnerPubliclyVisible({
        verificationStatus: 'APPROVED',
        activationStatus: 'INACTIVE',
        accountStatus: 'ACTIVE',
        profileReady: true,
      }),
      false
    );
  });

  it('hides REJECTED and incomplete approved partners from discovery', () => {
    const rejected = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: { verificationStatus: 'REJECTED' },
      store: contractorStore('DRAFT'),
      user: { status: 'PENDING_VERIFICATION' },
      serviceCount: 1,
    });
    assert.equal(rejected.visible, false);
    assert.equal(rejected.ready, false);

    const incomplete = evaluateReadiness({
      kind: 'STORE',
      profile: approved,
      store: storefront('INACTIVE', { phone: '', coverImage: '' }),
      user: active,
      productCount: 0,
      priceCount: 0,
      categoryCount: 0,
    });
    assert.equal(incomplete.profileReady, false);
    assert.equal(incomplete.ready, false);
    assert.equal(incomplete.visible, false);
  });
});

describe('Flow 03 checklist navigation', () => {
  it('maps every backend readiness key to a real partner form', () => {
    const maps = checklistMaps();
    const contractor = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('INACTIVE'),
      user: active,
      serviceCount: 0,
    });
    const store = evaluateReadiness({
      kind: 'STORE',
      profile: approved,
      store: storefront('INACTIVE'),
      user: active,
      productCount: 0,
      priceCount: 0,
      categoryCount: 0,
    });
    for (const item of contractor.checks) {
      assert.ok(maps.contractor[item.key], `missing contractor link for ${item.key}`);
    }
    for (const item of store.checks) {
      assert.ok(maps.store[item.key], `missing store link for ${item.key}`);
    }
    assert.equal(maps.contractor.services.route, '/contractor/services');
    assert.equal(maps.store.categories.route, '/store/materials');
    assert.equal(maps.store.products.route, '/store/products');
    assert.equal(maps.store.prices.route, '/store/products');
    assert.equal(maps.contractor.location.hash, '#location');
    assert.equal(maps.store.address.hash, '#address');
  });
});

describe('Flow 03 frontend activation controls', () => {
  it('sends APPROVED partners to the matching dashboard and keeps others on the gate', () => {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, 'context/AuthContext.tsx'), 'utf8');
    assert.match(src, /CONTRACTOR:\s*'\/contractor\/dashboard'/);
    assert.match(src, /MATERIAL_STORE_OWNER:\s*'\/store\/dashboard'/);
    assert.match(src, /profileStatus !== 'APPROVED'/);
    assert.match(src, /\/partner\/onboarding\/status/);
  });

  it('hides the activate action until backend ready is true', () => {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, 'components/partner/ActivationPanel.tsx'), 'utf8');
    assert.match(src, /activation\.ready && activation\.activationStatus !== 'LIVE'/);
    assert.match(src, /ready && !paused/);
    assert.match(src, /api\.activate\(\)/);
  });
});

describe('Flow 03 order and request gates', () => {
  it('lets repair requests use the public visibility gate', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/repairService.js'), 'utf8');
    assert.match(src, /getActivationReadiness/);
    assert.match(src, /readiness\.visible/);
    assert.match(src, /not accepting new requests/);
  });

  it('keeps material requests on approved live stores without a checkout path', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/material-requirement.service.js'), 'utf8');
    const routes = fs.readFileSync(path.resolve(__dirname, '../routes/index.js'), 'utf8');
    assert.match(src, /assertApprovedLiveStore/);
    assert.match(src, /Only customers can send a direct material request/);
    assert.doesNotMatch(routes, /material-checkout/);
  });

  it('activates without inventing a new status and stays LIVE on a repeat call', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/activation.service.js'), 'utf8');
    assert.match(src, /store\.status = STORE_STATUS\.LIVE/);
    assert.match(src, /Only an approved partner can activate/);
    assert.match(src, /Complete the public profile before activating/);
    assert.equal(/if \(store\.status === STORE_STATUS\.LIVE\) throw/.test(src), false);
  });
});
