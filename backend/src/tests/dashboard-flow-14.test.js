const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  classifyContractorUploadUrl,
  decideContractorUpload,
} = require('../utils/contractor-public-upload');
const { isBlockedPublicUpload } = require('../utils/public-uploads');

const ROOT = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Flow 14 Customer dashboard activity blocks', () => {
  it('does not render unlabeled navy placeholder bars', () => {
    const page = read('frontend/src/pages/CustomerDashboardPage.tsx');
    assert.equal(page.includes('activityBars'), false);
    assert.equal(page.includes('bg-navy-800/90'), false);
    assert.match(page, /customerHome\.activityEmpty/);
    assert.match(page, /materialOrderApi/);
    assert.match(page, /chatApi/);
    assert.match(page, /CUSTOMER_ACCEPTED/);
  });

  it('keeps KPI cards as links to existing customer routes', () => {
    const page = read('frontend/src/pages/CustomerDashboardPage.tsx');
    assert.match(page, /to: '\/customer\/explore'/);
    assert.match(page, /to: '\/customer\/request\/history'/);
    assert.match(page, /to: '\/customer\/orders'/);
    assert.match(page, /to: '\/customer\/chat'/);
    assert.match(page, /\/customer\/material-orders/);
  });
});

describe('Flow 14 Admin dashboard after GMV fix', () => {
  it('keeps GMV off finance.revenue and does not call distribute()', () => {
    const dashboard = read('admin/src/features/dashboard/services/dashboard.api.ts');
    assert.match(dashboard, /analytics\.finance\.gmv/);
    assert.equal(/value:\s*analytics\.finance\.revenue/.test(dashboard), false);
    assert.equal(/distribute\(/.test(dashboard), false);
    assert.match(dashboard, /href: '\/analytics'/);
    assert.match(dashboard, /href: '\/commission'/);
  });

  it('shows an empty chart state instead of fabricating values', () => {
    const trend = read('admin/src/features/dashboard/components/OrderTrendChart.tsx');
    const revenue = read('admin/src/features/dashboard/components/RevenueChart.tsx');
    const growth = read('admin/src/features/dashboard/components/UserGrowthChart.tsx');
    const status = read('admin/src/features/dashboard/components/OrderStatusChart.tsx');
    assert.match(trend, /chartHasValues/);
    assert.match(trend, /dash\.noChartData/);
    assert.match(revenue, /dash\.noChartData/);
    assert.match(revenue, /formatKpi/);
    assert.match(growth, /dash\.noChartData/);
    assert.match(status, /dash\.noStatusData/);
    const format = read('admin/src/features/dashboard/lib/format.ts');
    assert.equal(format.includes('Math.sin'), false);
    assert.equal(/export function distribute\(/.test(format), false);
  });
});

describe('Flow 14 public contractor photos vs CCCD', () => {
  it('allows portfolio photos under /uploads/contractors and still denies CCCD', () => {
    const avatar = '/uploads/contractors/owner-1/avatar.jpg';
    const cccd = '/uploads/contractors/owner-1/cccd.jpg';
    assert.equal(
      classifyContractorUploadUrl(avatar, { portfolio: { avatar } }),
      'allow'
    );
    assert.equal(
      classifyContractorUploadUrl(cccd, {
        documents: [{ url: cccd, type: 'CCCD_FRONT' }],
        portfolio: { avatar },
      }),
      'deny'
    );
    assert.equal(classifyContractorUploadUrl(cccd, {}), 'unknown');
    assert.equal(decideContractorUpload(cccd, [{}]), false);
    assert.equal(isBlockedPublicUpload(cccd), true);
    assert.equal(
      decideContractorUpload(avatar, [{ portfolio: { avatar } }, { documents: [{ url: cccd, type: 'CCCD_FRONT' }] }]),
      true
    );
  });

  it('does not reopen the contractors static folder and moves new portfolio uploads to stores', () => {
    const app = read('backend/src/app.js');
    const routes = read('backend/src/routes/contractorRoutes.js');
    assert.match(app, /canServeContractorPublicFile/);
    assert.match(app, /isBlockedPublicUpload/);
    assert.match(routes, /storeUpload\.single\('file'\)/);
    assert.equal(routes.includes("verificationUpload.single('file')"), true);
  });

  it('sends logged-in users from / to the role dashboard without a workspace CTA', () => {
    const layout = read('frontend/src/components/layout/MainLayout.tsx');
    const surface = read('frontend/src/routes/CustomerSurface.tsx');
    const auth = read('frontend/src/context/AuthContext.tsx');
    const login = read('frontend/src/pages/auth/Login.tsx');
    assert.match(auth, /CUSTOMER: '\/customer\/dashboard'/);
    assert.match(auth, /CONTRACTOR: '\/contractor\/dashboard'/);
    assert.match(auth, /MATERIAL_STORE_OWNER: '\/store\/dashboard'/);
    assert.match(surface, /pathname === '\/'/);
    assert.match(surface, /getDefaultRouteByRole/);
    assert.match(login, /getDefaultRouteByRole\(session\.user\)/);
    assert.equal(layout.includes('openDashboard'), false);
    assert.equal(layout.includes('LANDING_ENTRY'), false);
  });

  it('keeps admin session on a temporary network error and clears cache on logout', () => {
    const auth = read('admin/src/auth/auth.store.ts');
    assert.match(auth, /invalidateCache\(\)/);
    assert.match(auth, /status === 401 \|\| status === 403/);
    assert.match(auth, /set\(\{ loading: false \}\)/);
  });
});
