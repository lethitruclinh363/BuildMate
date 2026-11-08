const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Admin partner profile is separate from approval management', () => {
  it('sends list profile actions to dedicated detail routes instead of the approval queue', () => {
    const list = read('admin/src/contractors/ContractorsPage.tsx');
    const routes = read('admin/src/routes/index.tsx');
    const sidebar = read('admin/src/layouts/Sidebar.tsx');

    assert.match(list, /\/contractors\/\$\{row\.id\}\/profile/);
    assert.match(list, /\/material-stores\/\$\{row\.id\}\/profile/);
    assert.equal(/\/partners\/contractors\?id=/.test(list), false);
    assert.equal(/\/partners\/stores\?id=/.test(list), false);
    assert.match(list, /\/partners\/contractors/);
    assert.match(list, /\/partners\/stores/);

    assert.match(routes, /path="\/contractors\/:id\/profile"/);
    assert.match(routes, /path="\/material-stores\/:id\/profile"/);
    assert.match(routes, /path="\/partners\/contractors"/);
    assert.match(routes, /path="\/partners\/stores"/);
    assert.match(routes, /AdminVerificationPage actor="CONTRACTOR"/);
    assert.match(routes, /AdminVerificationPage actor="MATERIAL_STORE_OWNER"/);

    assert.match(sidebar, /to: '\/partners\/contractors'/);
    assert.match(sidebar, /to: '\/partners\/stores'/);
    assert.match(sidebar, /to: '\/contractors'/);
    assert.match(sidebar, /to: '\/material-stores'/);
  });

  it('loads a single partner with the existing admin GET and does not mutate approval state', () => {
    const page = read('admin/src/partners/PartnerDetailPage.tsx');
    const api = read('admin/src/services/admin.api.ts');
    const service = read('backend/src/services/adminService.js');
    const adminRoutes = read('backend/src/routes/adminRoutes.js');
    const verification = read('admin/src/pages/verification/AdminVerificationPage.tsx');

    assert.match(page, /adminApi\.getVerification\(id\)/);
    assert.equal(/adminApi\.approve\(/.test(page), false);
    assert.equal(/adminApi\.reject\(/.test(page), false);
    assert.equal(/retakeEkyc/.test(page), false);
    assert.match(page, /publicDocuments\(/);
    assert.match(page, /partnerProfile\.ekycStatus/);
    assert.match(page, /OperatingHoursPanel/);
    assert.match(read('admin/src/partners/partnerProfile.utils.ts'), /CCCD_FRONT/);
    assert.match(api, /\/admin\/verifications\/\$\{id\}/);
    assert.match(service, /store: publicStoreSummary\(store, profile\.weeklyHours\)/);
    assert.match(service, /materials: materialRows\.map\(publicMaterialSummary\)/);
    assert.match(adminRoutes, /router\.get\('\/verifications\/:id'/);
    assert.match(adminRoutes, /router\.post\('\/verifications\/:id\/approve'/);
    assert.match(verification, /adminApi\.approve\(/);
    assert.match(verification, /adminApi\.reject\(/);
  });
});
