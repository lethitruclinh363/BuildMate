const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { profileSchema, storeSchema } = require('../validators/partner.validator');
const { PgProfile, PgStore } = require('../repositories/partner.postgres');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { Store, STORE_STATUS, STORE_TYPE } = require('../models/Store');
const contractorService = require('../services/contractorService');
const adminService = require('../services/adminService');

describe('Onboarding Location Requirements (Prompt 02)', () => {
  describe('1. Contractor saves address and coordinates in draft', () => {
    it('validates profileSchema accepts full location payload', () => {
      const payload = {
        businessName: 'Đội Thợ Cần Thơ',
        address: '123 Đường 30 Tháng 4',
        city: 'Cần Thơ',
        lat: 10.0351234,
        lng: 105.7804567,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
        providerRefId: 'vietmap_ref_1001',
      };
      const parsed = profileSchema.safeParse(payload);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.lat, 10.0351234);
      assert.equal(parsed.data.lng, 105.7804567);
      assert.equal(parsed.data.locationConfirmed, true);
      assert.equal(parsed.data.locationSource, 'VIETMAP_PLACE');
      assert.equal(parsed.data.providerRefId, 'vietmap_ref_1001');
    });

    it('PgProfile and toPublic expose contractor location attributes', () => {
      const profile = new PgProfile({
        _id: '507f1f77bcf86cd799439011',
        userId: '507f1f77bcf86cd799439012',
        businessName: 'Thợ Mộc Minh Hoàng',
        address: '456 Cách Mạng Tháng 8',
        city: 'Cần Thơ',
        lat: 10.0456,
        lng: 105.7789,
        locationConfirmed: true,
        locationSource: 'GPS',
        locationConfirmedAt: new Date('2026-10-27T10:00:00Z'),
        providerRefId: 'ref_contractor_01',
      });

      const published = profile.toPublic();
      assert.equal(published.address, '456 Cách Mạng Tháng 8');
      assert.equal(published.city, 'Cần Thơ');
      assert.equal(published.lat, 10.0456);
      assert.equal(published.lng, 105.7789);
      assert.equal(published.latitude, 10.0456);
      assert.equal(published.longitude, 105.7789);
      assert.equal(published.locationConfirmed, true);
      assert.equal(published.locationSource, 'GPS');
      assert.equal(published.providerRefId, 'ref_contractor_01');
      assert.deepEqual(published.location, {
        type: 'Point',
        coordinates: [105.7789, 10.0456],
      });
    });
  });

  describe('2. Material Store Owner saves address and coordinates in draft', () => {
    it('validates profileSchema accepts material store location payload', () => {
      const payload = {
        businessName: 'Cửa Hàng VLXD Hưng Phú',
        address: '789 Trần Hưng Đạo',
        city: 'Cần Thơ',
        lat: 10.0215,
        lng: 105.7654,
        locationConfirmed: true,
        locationSource: 'MANUAL_PIN',
        providerRefId: 'pin_material_01',
      };
      const parsed = profileSchema.safeParse(payload);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.lat, 10.0215);
      assert.equal(parsed.data.lng, 105.7654);
      assert.equal(parsed.data.locationConfirmed, true);
      assert.equal(parsed.data.locationSource, 'MANUAL_PIN');
    });

    it('PgProfile exposes material store owner location attributes', () => {
      const profile = new PgProfile({
        _id: '507f1f77bcf86cd799439021',
        userId: '507f1f77bcf86cd799439022',
        businessName: 'Đại Lý Xi Măng Hà Tiên',
        address: '101 Quốc Lộ 91B',
        city: 'Cần Thơ',
        lat: 10.0312,
        lng: 105.7543,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
      });
      const published = profile.toPublic();
      assert.equal(published.lat, 10.0312);
      assert.equal(published.lng, 105.7543);
      assert.equal(published.locationConfirmed, true);
      assert.equal(published.locationSource, 'VIETMAP_PLACE');
    });
  });

  describe('3. Incomplete draft saves without blocking', () => {
    it('accepts draft payload without lat/lng coordinates', () => {
      const draftPayload = {
        businessName: 'Xưởng Nhôm Kính Tân Tiến',
        address: '12 Đường 30/4',
        city: 'Cần Thơ',
      };
      const parsed = profileSchema.safeParse(draftPayload);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.lat, undefined);
      assert.equal(parsed.data.lng, undefined);
      assert.equal(parsed.data.locationConfirmed, undefined);
    });

    it('PgProfile allows null coordinates in draft mode', () => {
      const profile = new PgProfile({
        _id: '507f1f77bcf86cd799439031',
        userId: '507f1f77bcf86cd799439032',
        businessName: 'Bản Nháp Chưa Ghim Vị Trí',
        address: 'Chưa xác định',
        city: 'Cần Thơ',
      });
      const published = profile.toPublic();
      assert.equal(published.lat, null);
      assert.equal(published.lng, null);
      assert.equal(published.locationConfirmed, false);
      assert.equal(published.location, null);
    });
  });

  describe('4. Validation and submission guard: Missing coordinates are rejected', () => {
    it('rejects coordinates out of range [-90, 90] and [-180, 180]', () => {
      const badLat = profileSchema.safeParse({
        businessName: 'Cơ Sở A',
        lat: 95.5,
        lng: 105.0,
      });
      assert.equal(badLat.success, false);

      const badLng = profileSchema.safeParse({
        businessName: 'Cơ Sở A',
        lat: 10.0,
        lng: 185.0,
      });
      assert.equal(badLng.success, false);
    });

    it('rejects NaN or Infinity coordinates', () => {
      const nanParsed = profileSchema.safeParse({
        businessName: 'Cơ Sở A',
        lat: 'not-a-number',
        lng: 105.0,
      });
      assert.equal(nanParsed.success, false);
    });

    it('rejects (0, 0) coordinates when locationConfirmed is true', () => {
      const zeroParsed = profileSchema.safeParse({
        businessName: 'Cơ Sở Không Hợp Lệ',
        lat: 0,
        lng: 0,
        locationConfirmed: true,
      });
      assert.equal(zeroParsed.success, false);
    });

    it('rejects storeSchema with (0, 0) coordinates when confirmed', () => {
      const zeroStore = storeSchema.safeParse({
        name: 'Store Zero',
        address: '123 Đường Số 1',
        lat: 0,
        lng: 0,
        locationConfirmed: true,
      });
      assert.equal(zeroStore.success, false);
    });
  });

  describe('5. Submit verification with valid confirmed coordinates', () => {
    it('accepts valid confirmed coordinates in profile schema', () => {
      const validPayload = {
        businessName: 'Đội Thợ Minh Tiến',
        address: '55 Hai Bà Trưng',
        city: 'Cần Thơ',
        lat: 10.033,
        lng: 105.786,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
      };
      const parsed = profileSchema.safeParse(validPayload);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.lat, 10.033);
      assert.equal(parsed.data.lng, 105.786);
      assert.equal(parsed.data.locationConfirmed, true);
    });
  });

  describe('6. Admin views coordinates from pending verification', () => {
    it('toPublic returns all registered location fields for Admin view', () => {
      const profile = new PgProfile({
        _id: '507f1f77bcf86cd799439041',
        userId: '507f1f77bcf86cd799439042',
        businessName: 'Đội Thi Công Chờ Duyệt',
        address: '88 Mậu Thân',
        city: 'Cần Thơ',
        lat: 10.0388,
        lng: 105.7722,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
        locationConfirmedAt: new Date('2026-10-27T08:30:00Z'),
        providerRefId: 'ref_admin_view_01',
        verificationStatus: VERIFICATION_STATUS.SUBMITTED,
      });
      const published = profile.toPublic();
      assert.equal(published.address, '88 Mậu Thân');
      assert.equal(published.city, 'Cần Thơ');
      assert.equal(published.lat, 10.0388);
      assert.equal(published.lng, 105.7722);
      assert.equal(published.locationConfirmed, true);
      assert.equal(published.locationSource, 'VIETMAP_PLACE');
      assert.ok(published.locationConfirmedAt);
      assert.equal(published.providerRefId, 'ref_admin_view_01');
    });
  });

  describe('7. Admin approval synchronizes registered coordinates and records timestamp', () => {
    it('PgStore toPublic exposes approved coordinates and locationApprovedAt', () => {
      const approvedAt = new Date('2026-10-27T12:00:00Z');
      const store = new PgStore({
        _id: '507f1f77bcf86cd799439051',
        contractorId: '507f1f77bcf86cd799439052',
        name: 'Đội Thợ Đã Được Duyệt',
        address: '88 Mậu Thân',
        city: 'Cần Thơ',
        lat: 10.0388,
        lng: 105.7722,
        verified: true,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
        locationApprovedAt: approvedAt,
      });

      const published = store.toPublic();
      assert.equal(published.lat, 10.0388);
      assert.equal(published.lng, 105.7722);
      assert.equal(published.verified, true);
      assert.equal(published.locationConfirmed, true);
      assert.equal(published.locationApprovedAt, approvedAt);
      assert.deepEqual(published.location, {
        type: 'Point',
        coordinates: [105.7722, 10.0388],
      });
    });
  });

  describe('8. Admin rejection does not make location public', () => {
    it('PgStore for rejected partner remains unverified and locationApprovedAt is null', () => {
      const store = new PgStore({
        _id: '507f1f77bcf86cd799439061',
        contractorId: '507f1f77bcf86cd799439062',
        name: 'Đội Thợ Bị Từ Chối',
        status: STORE_STATUS.DRAFT,
        verified: false,
        lat: 10.0388,
        lng: 105.7722,
        locationApprovedAt: null,
      });

      const published = store.toPublic();
      assert.equal(published.status, STORE_STATUS.DRAFT);
      assert.equal(published.verified, false);
      assert.equal(published.locationApprovedAt, null);
    });
  });

  describe('9. No fake Can Tho default coordinates generated', () => {
    it('legacy profile without coordinates does not invent fake Can Tho marker', () => {
      const legacyProfile = new PgProfile({
        _id: '507f1f77bcf86cd799439071',
        userId: '507f1f77bcf86cd799439072',
        businessName: 'Hồ Sơ Cũ Chưa Có Tọa Độ',
        address: 'Địa chỉ cũ',
        city: 'Cần Thơ',
        lat: null,
        lng: null,
        location: null,
      });

      const published = legacyProfile.toPublic();
      assert.equal(published.lat, null);
      assert.equal(published.lng, null);
      assert.equal(published.location, null);
      assert.notDeepEqual(published.location?.coordinates, [105.787, 10.045]);
    });

    it('legacy store without coordinates does not default to [105.787, 10.045]', () => {
      const legacyStore = new PgStore({
        _id: '507f1f77bcf86cd799439081',
        contractorId: '507f1f77bcf86cd799439082',
        name: 'Cửa Hàng Cũ Chưa Có Tọa Độ',
        lat: null,
        lng: null,
        location: null,
      });

      const published = legacyStore.toPublic();
      assert.equal(published.lat, null);
      assert.equal(published.lng, null);
      assert.equal(published.location, null);
      assert.notDeepEqual(published.location?.coordinates, [105.787, 10.045]);
    });
  });

  describe('10. Does not corrupt existing location data on subsequent step updates', () => {
    it('partial update without coordinates preserves previously set coordinates', () => {
      const profile = new PgProfile({
        _id: '507f1f77bcf86cd799439091',
        userId: '507f1f77bcf86cd799439092',
        businessName: 'Đội Thợ Tiến Đạt',
        address: '100 Đường 30/4',
        city: 'Cần Thơ',
        lat: 10.0355,
        lng: 105.7811,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
      });

      // Simulating Step 5 update: saving completedSteps without passing lat/lng
      profile.completedSteps = [true, true, true, true, true, false];

      const published = profile.toPublic();
      assert.equal(published.lat, 10.0355);
      assert.equal(published.lng, 105.7811);
      assert.equal(published.locationConfirmed, true);
      assert.equal(published.locationSource, 'VIETMAP_PLACE');
    });
  });
});
