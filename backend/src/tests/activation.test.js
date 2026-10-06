const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReadiness, isPartnerPubliclyVisible } = require('../services/activation.service');

const place = { type: 'Point', coordinates: [105.746, 10.045] };

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

const approved = { verificationStatus: 'APPROVED' };
const active = { status: 'ACTIVE' };

describe('activation visibility', () => {
  it('keeps a pending partner off the public platform', () => {
    const result = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: { verificationStatus: 'SUBMITTED' },
      store: contractorStore('INACTIVE'),
      user: { status: 'PENDING_VERIFICATION' },
      serviceCount: 1,
    });
    assert.equal(result.visible, false);
    assert.equal(result.activationStatus, 'INACTIVE');
  });

  it('gives an approved inactive partner dashboard access but not public visibility', () => {
    const result = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('INACTIVE'),
      user: active,
      serviceCount: 1,
    });
    assert.equal(result.ready, true);
    assert.equal(result.visible, false);
  });

  it('refuses activation readiness while the public profile is incomplete', () => {
    const result = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('INACTIVE', { avatar: '', logo: '', description: 'Tốt' }),
      user: active,
      serviceCount: 0,
    });
    assert.equal(result.profileReady, false);
    assert.equal(result.ready, false);
  });

  it('marks a complete approved profile ready to activate', () => {
    const result = evaluateReadiness({
      kind: 'STORE',
      profile: approved,
      store: storefront('INACTIVE'),
      user: active,
      productCount: 1,
      priceCount: 1,
      categoryCount: 1,
    });
    assert.equal(result.ready, true);
    assert.equal(result.activationStatus, 'INACTIVE');
    assert.equal(result.visible, false);
  });

  it('shows only an approved live ready partner', () => {
    const result = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('LIVE'),
      user: active,
      serviceCount: 1,
    });
    assert.equal(result.visible, true);
    assert.equal(isPartnerPubliclyVisible({
      verificationStatus: 'APPROVED',
      activationStatus: 'LIVE',
      accountStatus: 'ACTIVE',
      profileReady: true,
    }), true);
  });

  it('hides a paused partner from discovery', () => {
    const result = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('PAUSED'),
      user: active,
      serviceCount: 1,
    });
    assert.equal(result.activationStatus, 'PAUSED');
    assert.equal(result.visible, false);
    assert.equal(result.ready, true);
  });

  it('hides a blocked account even when the store is live', () => {
    const result = evaluateReadiness({
      kind: 'STORE',
      profile: approved,
      store: storefront('LIVE'),
      user: { status: 'BLOCKED' },
      productCount: 1,
      categoryCount: 1,
    });
    assert.equal(result.visible, false);
  });

  it('keeps the default map pin unfinished until the owner saves a location', () => {
    const missing = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('INACTIVE', {
        location: { type: 'Point', coordinates: [105.787, 10.045] },
        locationConfirmed: false,
      }),
      user: active,
      serviceCount: 1,
    });
    assert.equal(missing.checks.find((item) => item.key === 'location').ok, false);
    assert.equal(missing.ready, false);

    const saved = evaluateReadiness({
      kind: 'STORE',
      profile: approved,
      store: storefront('INACTIVE', {
        location: { type: 'Point', coordinates: [105.787, 10.045] },
        locationConfirmed: true,
      }),
      user: active,
      productCount: 1,
      priceCount: 1,
      categoryCount: 1,
    });
    assert.equal(saved.checks.find((item) => item.key === 'location').ok, true);
    assert.equal(saved.ready, true);

    const moved = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('INACTIVE', {
        location: { type: 'Point', coordinates: [105.762, 10.022] },
        locationConfirmed: false,
      }),
      user: active,
      serviceCount: 1,
    });
    assert.equal(moved.checks.find((item) => item.key === 'location').ok, false);
  });

  it('does not let a live store satisfy a contractor checklist', () => {
    const contractor = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: approved,
      store: contractorStore('LIVE'),
      user: active,
      serviceCount: 1,
    });
    const store = evaluateReadiness({
      kind: 'STORE',
      profile: approved,
      store: storefront('INACTIVE'),
      user: active,
      productCount: 0,
      categoryCount: 1,
    });
    assert.equal(contractor.visible, true);
    assert.equal(store.visible, false);
    assert.equal(store.ready, false);
  });
});
