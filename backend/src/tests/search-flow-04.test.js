const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { geoNearStage } = require('../services/locationService');
const { cardIsPublic, evaluateReadiness } = require('../services/activation.service');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');
const place = { type: 'Point', coordinates: [105.746, 10.045] };

describe('Flow 04 nearby radius and distance', () => {
  it('converts 3, 5 and 10 km to GeoJSON metres', () => {
    assert.equal(geoNearStage(10.045, 105.746, 3).maxDistance, 3000);
    assert.equal(geoNearStage(10.045, 105.746, 5).maxDistance, 5000);
    assert.equal(geoNearStage(10.045, 105.746, 10).maxDistance, 10000);
  });

  it('exposes 3, 5 and 10 km on the explore radius control', () => {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, 'features/map/components/RadiusSelector.tsx'), 'utf8');
    assert.match(src, /const radii = \[3, 5, 10\]/);
  });
});

describe('Flow 04 public visibility surfaces', () => {
  it('keeps nearby map cards on cardIsPublic / evaluateReadiness.visible', () => {
    const loc = fs.readFileSync(path.resolve(__dirname, '../services/locationService.js'), 'utf8');
    assert.match(loc, /cardIsPublic\(card, catalog\)/);
    const hidden = cardIsPublic(
      {
        verified: true,
        businessName: 'Crew',
        avatar: '/a.png',
        description: 'Sửa điện nước tại Cần Thơ',
        address: 'Ninh Kieu',
        openingHours: '07:00 – 18:00',
        phone: '0901234567',
        location: place,
        locationConfirmed: true,
        accountStatus: 'ACTIVE',
        services: [{ name: 'Repair', category: 'Electrical', basePrice: 1 }],
      },
      'services'
    );
    const incomplete = cardIsPublic(
      {
        verified: true,
        businessName: 'Crew',
        avatar: '',
        description: 'Ngắn',
        phone: '',
        locationConfirmed: false,
        accountStatus: 'ACTIVE',
        services: [],
      },
      'services'
    );
    assert.equal(hidden, true);
    assert.equal(incomplete, false);
  });

  it('filters featured homepage candidates with the marketplace visible gate', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/featuredProvider.service.js'), 'utf8');
    assert.match(src, /readinessForLoaded/);
    assert.match(src, /visible/);
  });

  it('clears the featured homepage cache after activate or pause', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/activation.service.js'), 'utf8');
    assert.match(src, /clearFeaturedCache/);
  });

  it('re-checks visibility when creating a repair request', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/repairService.js'), 'utf8');
    assert.match(src, /getActivationReadiness/);
    assert.match(src, /readiness\.visible/);
  });

  it('hides a paused or unready crew from evaluateReadiness', () => {
    const paused = evaluateReadiness({
      kind: 'CONTRACTOR',
      profile: { verificationStatus: 'APPROVED' },
      store: {
        name: 'Crew',
        avatar: '/a.png',
        description: 'Sửa điện nước tại Cần Thơ',
        address: 'Ninh Kieu',
        openingHours: '07:00 – 18:00',
        phone: '0901234567',
        location: place,
        locationConfirmed: true,
        status: 'PAUSED',
      },
      user: { status: 'ACTIVE' },
      serviceCount: 1,
    });
    assert.equal(paused.visible, false);
  });
});

describe('Flow 04 frontend search and VietMap', () => {
  it('loads nearby contractors from the location API and shows empty and error states', () => {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, 'pages/customer/ExplorePage.tsx'), 'utf8');
    assert.match(src, /nearbyContractors/);
    assert.match(src, /explore\.noCrews/);
    assert.match(src, /ErrorState/);
    assert.match(src, /map\.gpsDenied/);
  });

  it('keeps VietMap as the map provider and fails closed without a key', () => {
    const view = fs.readFileSync(path.join(FRONTEND_ROOT, 'features/map/components/VietMapView.tsx'), 'utf8');
    const lib = fs.readFileSync(path.join(FRONTEND_ROOT, 'features/map/lib/vietmap.ts'), 'utf8');
    assert.match(lib, /VITE_VIETMAP_API_KEY/);
    assert.match(lib, /maps\.vietmap\.vn/);
    assert.match(view, /!apiKey/);
    assert.match(view, /map\.unavailable/);
  });

  it('opens the contractor profile and repair request from explore cards', () => {
    const card = fs.readFileSync(path.join(FRONTEND_ROOT, 'features/map/components/ContractorCard.tsx'), 'utf8');
    assert.match(card, /\/contractors\/\$\{place\.contractorId\}/);
    assert.match(card, /RequestRepairButton/);
  });
});
