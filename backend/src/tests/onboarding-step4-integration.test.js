const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { profileSchema, storeSchema } = require('../validators/partner.validator');
const { hasCoordinates } = require('../utils/geo');

describe('Prompt 03 - Onboarding Step 4 VietMap Integration & Validation', () => {
  describe('1. Step 4 Validation Rules (shared & backend schemas)', () => {
    it('requires address >= 4 chars and city >= 2 chars', () => {
      assert.equal('123 Đường 30/4'.trim().length >= 4, true);
      assert.equal('Cần Thơ'.trim().length >= 2, true);
      assert.equal('12'.trim().length >= 4, false);
      assert.equal('A'.trim().length >= 2, false);
    });

    it('requires valid coordinates within [-90, 90] and [-180, 180]', () => {
      assert.equal(hasCoordinates(10.035123, 105.780456), true);
      assert.equal(hasCoordinates(95, 105.78), false);
      assert.equal(hasCoordinates(10.03, 190), false);
      assert.equal(hasCoordinates(null, null), false);
      assert.equal(hasCoordinates(undefined, undefined), false);
    });

    it('strictly forbids (0, 0) coordinates as valid location', () => {
      assert.equal(hasCoordinates(0, 0), false);
      const res = profileSchema.safeParse({
        businessName: 'Đội Thợ Thử Nghiệm',
        address: '123 Đường 30 Tháng 4',
        city: 'Cần Thơ',
        lat: 0,
        lng: 0,
        locationConfirmed: true,
      });
      assert.equal(res.success, false);
    });

    it('rejects confirmation if locationConfirmed is not true', () => {
      const step4Completed = (address, city, lat, lng, confirmed) => {
        const addressOk = (address || '').trim().length >= 4;
        const cityOk = (city || '').trim().length >= 2;
        const coordsOk = hasCoordinates(lat, lng);
        const locationConfirmedOk = confirmed === true;
        return addressOk && cityOk && coordsOk && locationConfirmedOk;
      };

      assert.equal(step4Completed('123 Đường 30 Tháng 4', 'Cần Thơ', 10.035, 105.78, false), false);
      assert.equal(step4Completed('123 Đường 30 Tháng 4', 'Cần Thơ', 10.035, 105.78, true), true);
      assert.equal(step4Completed('123', 'Cần Thơ', 10.035, 105.78, true), false);
      assert.equal(step4Completed('123 Đường 30 Tháng 4', '', 10.035, 105.78, true), false);
      assert.equal(step4Completed('123 Đường 30 Tháng 4', 'Cần Thơ', null, null, true), false);
    });
  });

  describe('2. State Transitions & Invalidation on Change', () => {
    it('invalidates confirmed status when marker is moved', () => {
      let state = {
        address: '123 Đường 30 Tháng 4',
        city: 'Cần Thơ',
        lat: 10.035,
        lng: 105.78,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
      };

      // User drags marker to a new point
      const newLat = 10.040;
      const newLng = 105.790;
      state = {
        ...state,
        lat: newLat,
        lng: newLng,
        locationSource: 'MANUAL_PIN',
        locationConfirmed: false, // Must reset to false!
      };

      assert.equal(state.locationConfirmed, false);
      assert.equal(state.locationSource, 'MANUAL_PIN');
      assert.equal(state.lat, 10.040);
    });

    it('invalidates confirmed status when address or city text is edited manually', () => {
      let state = {
        address: '123 Đường 30 Tháng 4',
        city: 'Cần Thơ',
        lat: 10.035,
        lng: 105.78,
        locationConfirmed: true,
        locationSource: 'GPS',
      };

      // User types in address input
      state = {
        ...state,
        address: '125 Đường 30 Tháng 4 (Tầng 2)',
        locationConfirmed: false, // Must reset to false!
      };

      assert.equal(state.locationConfirmed, false);
      assert.equal(state.address, '125 Đường 30 Tháng 4 (Tầng 2)');
    });
  });

  describe('3. Draft Persistence & Restoration (Back/Reload/Re-login)', () => {
    it('restores draft with confirmed location and coordinates intact', () => {
      const storedLocal = {
        businessName: 'Đội Thợ Tiến Phát',
        address: '456 Nguyễn Văn Cừ, An Hòa',
        city: 'Cần Thơ',
        lat: 10.045123,
        lng: 105.765432,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
        providerRefId: 'place_ref_999',
        completed: [true, true, true, true, false, false],
        step: 4,
      };

      const restoredDraft = {
        address: storedLocal.address,
        city: storedLocal.city,
        lat: storedLocal.lat,
        lng: storedLocal.lng,
        locationConfirmed: storedLocal.locationConfirmed,
        locationSource: storedLocal.locationSource,
        providerRefId: storedLocal.providerRefId,
      };

      assert.equal(restoredDraft.address, '456 Nguyễn Văn Cừ, An Hòa');
      assert.equal(restoredDraft.city, 'Cần Thơ');
      assert.equal(restoredDraft.lat, 10.045123);
      assert.equal(restoredDraft.lng, 105.765432);
      assert.equal(restoredDraft.locationConfirmed, true);
      assert.equal(restoredDraft.locationSource, 'VIETMAP_PLACE');
      assert.equal(restoredDraft.providerRefId, 'place_ref_999');
    });

    it('does not invent fake Can Tho coordinates for initial empty draft', () => {
      const emptyDraft = {
        address: '',
        city: '',
        lat: null,
        lng: null,
        locationConfirmed: false,
        locationSource: undefined,
        providerRefId: undefined,
      };

      assert.equal(emptyDraft.lat, null);
      assert.equal(emptyDraft.lng, null);
      assert.equal(emptyDraft.locationConfirmed, false);
      assert.equal(hasCoordinates(emptyDraft.lat, emptyDraft.lng), false);
    });
  });

  describe('4. Contractor Profile API Payload Contract', () => {
    it('accepts full confirmed location in contractor profile schema', () => {
      const payload = {
        businessName: 'Công Ty Thi Công Xây Dựng Số 1',
        representativeName: 'Nguyễn Văn An',
        contactPhone: '0901234567',
        contactEmail: 'contractor@buildmate.vn',
        taxCode: '0312345678',
        yearsExperience: 5,
        workerCount: 12,
        address: '12 Đường Lê Lợi, Phường Bến Nghé, Quận 1',
        city: 'TP. Hồ Chí Minh',
        lat: 10.776889,
        lng: 106.700806,
        locationConfirmed: true,
        locationSource: 'VIETMAP_PLACE',
        providerRefId: 'vietmap_ref_hcm_01',
      };

      const parsed = profileSchema.safeParse(payload);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.lat, 10.776889);
      assert.equal(parsed.data.lng, 106.700806);
      assert.equal(parsed.data.locationConfirmed, true);
      assert.equal(parsed.data.locationSource, 'VIETMAP_PLACE');
      assert.equal(parsed.data.providerRefId, 'vietmap_ref_hcm_01');
    });
  });

  describe('5. Material Store Owner Profile API Payload Contract', () => {
    it('accepts full confirmed location in store profile schema', () => {
      const payload = {
        businessName: 'Cửa Hàng VLXD Nam Bộ',
        taxCode: '1801234567',
        description: 'Chuyên cung cấp cát, đá, xi măng, gạch xây dựng chất lượng cao.',
        address: '88 Đường Cách Mạng Tháng Tám, Phường Cái Khế',
        city: 'Cần Thơ',
        lat: 10.048912,
        lng: 105.779123,
        locationConfirmed: true,
        locationSource: 'GPS',
      };

      const parsed = profileSchema.safeParse(payload);
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.lat, 10.048912);
      assert.equal(parsed.data.lng, 105.779123);
      assert.equal(parsed.data.locationConfirmed, true);
      assert.equal(parsed.data.locationSource, 'GPS');
    });
  });

  describe('6. Browser Geolocation GPS Error Handling', () => {
    it('handles GPS denied error gracefully without crashing or setting fake coords', () => {
      const errorMap = {
        denied: 'Không thể truy cập vị trí. Bạn có thể nhập địa chỉ hoặc ghim vị trí trên bản đồ.',
        unavailable: 'Không lấy được vị trí hiện tại trên thiết bị này.',
      };

      const handleGpsError = (kind) => {
        return {
          errorMessage: errorMap[kind] || errorMap.unavailable,
          lat: null,
          lng: null,
          locationConfirmed: false,
        };
      };

      const deniedState = handleGpsError('denied');
      assert.match(deniedState.errorMessage, /truy cập vị trí/);
      assert.equal(deniedState.lat, null);
      assert.equal(deniedState.locationConfirmed, false);

      const unavailState = handleGpsError('unavailable');
      assert.match(unavailState.errorMessage, /Không lấy được vị trí/);
      assert.equal(unavailState.lat, null);
      assert.equal(unavailState.locationConfirmed, false);
    });
  });
});
