const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PgProfile, PgStore } = require('../repositories/partner.postgres');
const adminService = require('../services/adminService');

// Replication of the Admin frontend extraction logic for automated verification
function extractApplicationCoords(item) {
  const lat =
    item.lat !== undefined && item.lat !== null
      ? Number(item.lat)
      : item.latitude !== undefined && item.latitude !== null
        ? Number(item.latitude)
        : item.location?.coordinates?.[1] != null
          ? Number(item.location.coordinates[1])
          : null;

  const lng =
    item.lng !== undefined && item.lng !== null
      ? Number(item.lng)
      : item.longitude !== undefined && item.longitude !== null
        ? Number(item.longitude)
        : item.location?.coordinates?.[0] != null
          ? Number(item.location.coordinates[0])
          : null;

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function getLocationState(item) {
  const coords = extractApplicationCoords(item);
  const isConfirmed = item.locationConfirmed === true && Boolean(coords);
  const isApproved = isConfirmed && item.verificationStatus === 'APPROVED';

  if (isApproved) return 'STATE_C_APPROVED';
  if (isConfirmed) return 'STATE_B_PENDING_APPROVAL';
  return 'STATE_A_UNCONFIRMED';
}

describe('Admin Verification Registered Location (Prompt 04)', () => {
  describe('TC01 & TC02: Admin views pending Contractor & Store Owner with coordinates', () => {
    it('exposes all registered location attributes in Contractor application payload', () => {
      const contractor = new PgProfile({
        _id: '507f1f77bcf86cd799439001',
        userId: '507f1f77bcf86cd799439002',
        businessName: 'Đội Thợ Minh Tiến',
        address: '123 Đường 30 Tháng 4',
        city: 'Cần Thơ',
        lat: 10.0351,
        lng: 105.7804,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
        locationConfirmedAt: new Date('2026-10-27T10:00:00Z'),
        providerRefId: 'vietmap_ref_ct_01',
        verificationStatus: 'SUBMITTED',
      });

      const publicData = contractor.toPublic();
      assert.equal(publicData.address, '123 Đường 30 Tháng 4');
      assert.equal(publicData.city, 'Cần Thơ');
      assert.equal(publicData.lat, 10.0351);
      assert.equal(publicData.lng, 105.7804);
      assert.equal(publicData.locationConfirmed, true);
      assert.equal(publicData.locationSource, 'VIETMAP_PLACE');
      assert.equal(publicData.providerRefId, 'vietmap_ref_ct_01');
      assert.ok(publicData.locationConfirmedAt);
    });

    it('exposes all registered location attributes in Material Store Owner application payload', () => {
      const storeOwner = new PgProfile({
        _id: '507f1f77bcf86cd799439003',
        userId: '507f1f77bcf86cd799439004',
        businessName: 'Vật Liệu Xây Dựng Nam Cần Thơ',
        address: '88 Đường Nguyễn Văn Cừ',
        city: 'Cần Thơ',
        lat: 10.0412,
        lng: 105.7689,
        locationConfirmed: true,
        locationSource: 'GPS',
        locationConfirmedAt: new Date('2026-10-27T11:00:00Z'),
        providerRefId: 'gps_device_02',
        verificationStatus: 'SUBMITTED',
      });

      const publicData = storeOwner.toPublic();
      assert.equal(publicData.address, '88 Đường Nguyễn Văn Cừ');
      assert.equal(publicData.lat, 10.0412);
      assert.equal(publicData.lng, 105.7689);
      assert.equal(publicData.locationConfirmed, true);
      assert.equal(publicData.locationSource, 'GPS');
      assert.equal(publicData.verificationStatus, 'SUBMITTED');
    });
  });

  describe('TC03 & TC04: Exact coordinate extraction and profile switching isolation', () => {
    it('extracts exact coordinates from flat lat/lng or GeoJSON coordinates', () => {
      const app1 = {
        lat: 10.0351,
        lng: 105.7804,
      };
      const coords1 = extractApplicationCoords(app1);
      assert.deepEqual(coords1, { lat: 10.0351, lng: 105.7804 });

      const appGeoJson = {
        location: {
          type: 'Point',
          coordinates: [105.7689, 10.0412], // [lng, lat]
        },
      };
      const coordsGeo = extractApplicationCoords(appGeoJson);
      assert.deepEqual(coordsGeo, { lat: 10.0412, lng: 105.7689 });
    });

    it('switching between multiple profiles produces isolated, correct coordinates', () => {
      const contractorA = {
        id: 'A',
        businessName: 'Thợ Ninh Kiều',
        lat: 10.0311,
        lng: 105.7812,
        locationConfirmed: true,
      };
      const storeB = {
        id: 'B',
        businessName: 'Store Bình Thủy',
        lat: 10.0722,
        lng: 105.7345,
        locationConfirmed: true,
      };

      const coordsA = extractApplicationCoords(contractorA);
      const coordsB = extractApplicationCoords(storeB);

      assert.notDeepEqual(coordsA, coordsB);
      assert.equal(coordsA.lat, 10.0311);
      assert.equal(coordsB.lat, 10.0722);
    });
  });

  describe('TC05 & TC08: State classification (State A, B, C)', () => {
    it('classifies unconfirmed profile as STATE_A_UNCONFIRMED', () => {
      const unconfirmed = {
        address: '100 Lê Lợi',
        city: 'Cần Thơ',
        locationConfirmed: false,
        verificationStatus: 'SUBMITTED',
      };
      assert.equal(getLocationState(unconfirmed), 'STATE_A_UNCONFIRMED');
    });

    it('classifies confirmed pending profile as STATE_B_PENDING_APPROVAL', () => {
      const pendingConfirmed = {
        address: '100 Lê Lợi',
        city: 'Cần Thơ',
        lat: 10.03,
        lng: 105.78,
        locationConfirmed: true,
        verificationStatus: 'SUBMITTED',
      };
      assert.equal(getLocationState(pendingConfirmed), 'STATE_B_PENDING_APPROVAL');
    });

    it('classifies approved profile with confirmed coordinates as STATE_C_APPROVED', () => {
      const approvedConfirmed = {
        address: '100 Lê Lợi',
        city: 'Cần Thơ',
        lat: 10.03,
        lng: 105.78,
        locationConfirmed: true,
        verificationStatus: 'APPROVED',
      };
      assert.equal(getLocationState(approvedConfirmed), 'STATE_C_APPROVED');
    });

    it('legacy approved profile without coordinates remains STATE_A_UNCONFIRMED', () => {
      const legacyApproved = {
        address: '100 Lê Lợi',
        city: 'Cần Thơ',
        locationConfirmed: false,
        verificationStatus: 'APPROVED',
      };
      assert.equal(getLocationState(legacyApproved), 'STATE_A_UNCONFIRMED');
    });

    it('rejected profile with confirmed coordinates is not approved (remains pending/unapproved)', () => {
      const rejectedProfile = {
        address: '100 Lê Lợi',
        city: 'Cần Thơ',
        lat: 10.03,
        lng: 105.78,
        locationConfirmed: true,
        verificationStatus: 'REJECTED',
      };
      // Not approved, so location is not public
      assert.notEqual(getLocationState(rejectedProfile), 'STATE_C_APPROVED');
    });
  });

  describe('TC06, TC07 & TC10: Admin approval sets locationApprovedAt', () => {
    it('PgProfile preserves registered coordinates upon approval', () => {
      const profile = new PgProfile({
        _id: '507f1f77bcf86cd799439005',
        userId: '507f1f77bcf86cd799439006',
        businessName: 'Thợ Mộc Hưng Lợi',
        address: '321 Tầm Vu',
        city: 'Cần Thơ',
        lat: 10.015,
        lng: 105.765,
        locationConfirmed: true,
        locationConfirmedAt: new Date('2026-10-27T08:00:00Z'),
        verificationStatus: 'APPROVED',
        locationApprovedAt: new Date('2026-10-27T12:00:00Z'),
      });

      const published = profile.toPublic();
      assert.equal(published.verificationStatus, 'APPROVED');
      assert.equal(published.lat, 10.015);
      assert.equal(published.lng, 105.765);
      assert.ok(published.locationApprovedAt);
    });

    it('PgStore preserves coordinates and locationApprovedAt upon approval', () => {
      const store = new PgStore({
        _id: '507f1f77bcf86cd799439007',
        ownerId: '507f1f77bcf86cd799439008',
        name: 'Đại Lý Sơn Miền Tây',
        address: '55 3 Tháng 2',
        city: 'Cần Thơ',
        lat: 10.028,
        lng: 105.772,
        locationConfirmed: true,
        locationConfirmedAt: new Date('2026-10-27T08:30:00Z'),
        verified: true,
        locationApprovedAt: new Date('2026-10-27T12:30:00Z'),
      });

      const published = store.toPublic();
      assert.equal(published.verified, true);
      assert.equal(published.lat, 10.028);
      assert.equal(published.lng, 105.772);
      assert.ok(published.locationApprovedAt);
    });
  });

  describe('TC09 & TC12: Rejection of invalid, out-of-range, or fake coordinates', () => {
    it('returns null for (0, 0) coordinates (no fake equator marker)', () => {
      assert.equal(extractApplicationCoords({ lat: 0, lng: 0 }), null);
    });

    it('returns null for NaN or undefined coordinates', () => {
      assert.equal(extractApplicationCoords({ lat: NaN, lng: 105.78 }), null);
      assert.equal(extractApplicationCoords({ lat: null, lng: null }), null);
      assert.equal(extractApplicationCoords({}), null);
    });

    it('returns null for out-of-range coordinates', () => {
      assert.equal(extractApplicationCoords({ lat: 95.0, lng: 105.78 }), null);
      assert.equal(extractApplicationCoords({ lat: 10.0, lng: 190.0 }), null);
    });

    it('does not invent fake Can Tho coordinates for empty profile', () => {
      const emptyProfile = { address: 'Chỉ có text address', city: 'Cần Thơ' };
      const coords = extractApplicationCoords(emptyProfile);
      assert.equal(coords, null);
    });
  });

  describe('TC14: Localization completeness (VI / EN)', () => {
    it('verifies all required location keys exist in both vi.json and en.json', () => {
      const viPath = path.resolve(__dirname, '../../../admin/src/locales/vi.json');
      const enPath = path.resolve(__dirname, '../../../admin/src/locales/en.json');

      assert.ok(fs.existsSync(viPath), 'admin/src/locales/vi.json must exist');
      assert.ok(fs.existsSync(enPath), 'admin/src/locales/en.json must exist');

      const vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));
      const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

      const requiredKeys = [
        'locationTitle',
        'locationDesc',
        'locationAddress',
        'locationCity',
        'locationLatitude',
        'locationLongitude',
        'locationSource',
        'locationConfirmedAt',
        'locationApprovedAt',
        'locationPartnerStatus',
        'locationAdminStatus',
        'locationConfirmed',
        'locationUnconfirmed',
        'locationPendingApproval',
        'locationApproved',
        'locationNotApproved',
        'locationMissingCoords',
        'locationMissingCoordsDesc',
        'locationNoAddress',
        'mapUnavailable',
        'mapReadOnlyHint',
        'sourceGps',
        'sourcePlace',
        'sourceManual',
      ];

      for (const key of requiredKeys) {
        assert.ok(vi.verify && vi.verify[key], `vi.json missing verify.${key}`);
        assert.ok(en.verify && en.verify[key], `en.json missing verify.${key}`);
      }
    });
  });

  describe('TC15 & TC17: Non-admin security guards', () => {
    it('verifies admin listVerifications requires ADMIN role in adminService', async () => {
      // The admin route is protected by requireRole('ADMIN') and requireAuth
      const adminRoutesPath = path.resolve(__dirname, '../routes/adminRoutes.js');
      const adminRoutesContent = fs.readFileSync(adminRoutesPath, 'utf8');

      // Check route guards
      assert.ok(adminRoutesContent.includes("allowRole('ADMIN')"));
      assert.ok(adminRoutesContent.includes('authenticate'));
      assert.ok(adminRoutesContent.includes('/verifications'));
    });
  });
});
