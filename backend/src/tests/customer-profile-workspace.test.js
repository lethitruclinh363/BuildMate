const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '../../../frontend/src');

function readFe(rel) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

describe('customer workspace partner profiles', () => {
  it('keeps public /contractors and /stores on the landing layout', () => {
    const app = readFe('App.tsx');
    const publicBlock = app.slice(app.indexOf('<Route element={<MainLayout />}>'), app.indexOf('<Route path="/cart"'));
    assert.match(publicBlock, /path="\/contractors\/:id"/);
    assert.match(publicBlock, /path="\/stores\/:id"/);
    assert.match(publicBlock, /path="\/stores\/:id\/materials\/:materialId"/);
    assert.match(publicBlock, /ContractorPublicPage/);
    assert.match(publicBlock, /StorePublicPage/);
  });

  it('opens the same profile pages inside CustomerLayout for logged-in customers', () => {
    const app = readFe('App.tsx');
    const start = app.indexOf('path="/customer/dashboard"');
    const workspace = app.slice(start, app.indexOf('path="/contractor/dashboard"'));
    assert.match(workspace, /path="\/customer\/contractors\/:id"/);
    assert.match(workspace, /path="\/customer\/stores\/:id"/);
    assert.match(workspace, /path="\/customer\/stores\/:id\/materials\/:materialId"/);
    assert.match(workspace, /ContractorPublicPage/);
    assert.match(workspace, /StorePublicPage/);
    assert.equal((app.match(/<CustomerLayout \/>/g) || []).length, 2);
  });

  it('mirrors public profile URLs into the customer workspace instead of the landing chrome', () => {
    const surface = readFe('routes/CustomerSurface.tsx');
    assert.match(surface, /currentUser\?\.role === 'CUSTOMER'/);
    assert.match(surface, /pathname\.startsWith\('\/contractors\/'\)/);
    assert.match(surface, /pathname\.startsWith\('\/stores\/'\)/);
    assert.match(surface, /`\/customer\$\{pathname\}/);
  });

  it('sends explore profile buttons through role-aware workspace paths', () => {
    const paths = readFe('lib/partner-paths.ts');
    const popup = readFe('features/map/components/ExplorePopup.tsx');
    const crew = readFe('features/map/components/ContractorCard.tsx');
    const store = readFe('features/map/components/MaterialStoreCard.tsx');
    assert.match(paths, /\/customer\/contractors\//);
    assert.match(paths, /\/customer\/stores\//);
    assert.match(popup, /contractorProfilePath|usePartnerPaths/);
    assert.match(crew, /contractorProfilePath|usePartnerPaths/);
    assert.match(store, /storeProfilePath|usePartnerPaths/);
    assert.match(crew, /state=\{back\}/);
    assert.match(store, /state=\{back\}/);
  });

  it('keeps repair create linked to the viewed contractor and does not copy landing nav into the workspace', () => {
    const showcase = readFe('pages/public/ContractorProfileShowcase.tsx');
    const layout = readFe('components/layout/CustomerLayout.tsx');
    const landing = readFe('components/layout/MainLayout.tsx');
    assert.match(showcase, /RequestRepairButton/);
    assert.match(showcase, /contractorId=\{String\(profile\.contractorId\)\}/);
    assert.match(layout, /customerNav/);
    assert.doesNotMatch(layout, /nav\.why/);
    assert.match(landing, /nav\.why/);
    assert.match(landing, /href="\/#how"/);
  });
});
