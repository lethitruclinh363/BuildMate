const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toGeoPoint, fromGeoPoint } = require('../utils/geo');
const { autocomplete, place, reverse } = require('../services/vietmap.service');
const { ApiError } = require('../utils/ApiError');

const KEY = 'test-vietmap-key';

describe('location core', () => {
  it('stores GeoJSON as [longitude, latitude]', () => {
    const point = toGeoPoint(10.045, 105.746);
    assert.deepEqual(point, { type: 'Point', coordinates: [105.746, 10.045] });
    assert.deepEqual(fromGeoPoint(point), { lat: 10.045, lng: 105.746 });
    assert.equal(toGeoPoint(95, 105), null);
    assert.equal(toGeoPoint(10, 200), null);
    assert.equal(fromGeoPoint({ type: 'Point', coordinates: [200, 10] }), null);
  });

  it('autocompletes through VietMap v4 and keeps the key on the server request', async () => {
    const hits = await autocomplete('216 đường 3 tháng 2', { lat: 10.045, lng: 105.746 }, {
      apiKey: KEY,
      fetch: async (url) => {
        const href = new URL(String(url));
        assert.equal(href.pathname, '/api/autocomplete/v4');
        assert.equal(href.searchParams.get('apikey'), KEY);
        assert.equal(href.searchParams.get('text'), '216 đường 3 tháng 2');
        assert.equal(href.searchParams.get('focus'), '10.045,105.746');
        assert.equal(href.searchParams.get('display_type'), '5');
        assert.equal(href.searchParams.has('circle_radius'), false);
        assert.equal(href.searchParams.has('circle_center'), false);
        return {
          ok: true,
          json: async () => [
            {
              ref_id: 'auto:216-3-thang-2',
              name: '216 Đ. 3 Tháng 2',
              display: '216 Đ. 3 Tháng 2, Tân An, Cần Thơ',
              address: 'Tân An, Cần Thơ',
              boundaries: [
                { type: 2, full_name: 'Tân An' },
                { type: 0, full_name: 'Cần Thơ' },
              ],
              data_old: {
                boundaries: [
                  { type: 2, full_name: 'Tân An' },
                  { type: 1, full_name: 'Ninh Kiều' },
                  { type: 0, full_name: 'Cần Thơ' },
                ],
              },
            },
          ],
        };
      },
    });
    assert.equal(hits[0].refId, 'auto:216-3-thang-2');
    assert.equal(hits[0].display, '216 Đ. 3 Tháng 2, Tân An, Cần Thơ');
    assert.equal(hits[0].city, 'Cần Thơ');
    assert.equal(hits[0].district, 'Ninh Kiều');
    assert.equal('lat' in hits[0], false);
    assert.deepEqual(await autocomplete('a', {}, { apiKey: KEY, fetch: async () => assert.fail('fetch') }), []);
    await autocomplete('197 Trần Phú', { lat: Number.NaN, lng: 105 }, {
      apiKey: KEY,
      fetch: async (url) => {
        const href = new URL(String(url));
        assert.equal(href.searchParams.get('focus'), null);
        assert.equal(href.searchParams.has('circle_radius'), false);
        return { ok: true, json: async () => [] };
      },
    });
  });

  it('loads place coordinates from ref_id without guessing', async () => {
    const hit = await place('auto:216-3-thang-2', {
      apiKey: KEY,
      fetch: async (url) => {
        const href = new URL(String(url));
        assert.equal(href.pathname, '/api/place/v4');
        assert.equal(href.searchParams.get('refid'), 'auto:216-3-thang-2');
        assert.equal(href.searchParams.get('apikey'), KEY);
        return {
          ok: true,
          json: async () => ({
            display: '216 Đ. 3 Tháng 2, Tân An, Cần Thơ',
            address: '216 Đ. 3 Tháng 2',
            ward: 'Tân An',
            district: '',
            city: 'Cần Thơ',
            lat: 10.0341,
            lng: 105.7882,
          }),
        };
      },
    });
    assert.equal(hit.lat, 10.0341);
    assert.equal(hit.lng, 105.7882);
    assert.equal(hit.city, 'Cần Thơ');
    assert.equal('district' in hit, false);
  });

  it('reverse geocodes a point and rejects bad coordinates before calling VietMap', async () => {
    const hit = await reverse(10.045, 105.746, {
      apiKey: KEY,
      fetch: async (url) => {
        const href = new URL(String(url));
        assert.equal(href.pathname, '/api/reverse/v4');
        assert.equal(href.searchParams.get('lat'), '10.045');
        assert.equal(href.searchParams.get('lng'), '105.746');
        assert.equal(href.searchParams.get('display_type'), '5');
        return {
          ok: true,
          json: async () => [
            {
              display: '216 Đ. 3 Tháng 2, Tân An, Cần Thơ',
              lat: 10.045,
              lng: 105.746,
              ward: 'Tân An',
              city: 'Cần Thơ',
            },
          ],
        };
      },
    });
    assert.equal(hit.address, '216 Đ. 3 Tháng 2, Tân An, Cần Thơ');
    assert.equal(hit.lat, 10.045);
    assert.equal(hit.lng, 105.746);
    await assert.rejects(() => reverse(10, 200, { apiKey: KEY, fetch: async () => assert.fail('fetch') }), ApiError);
  });

  it('fails closed when VietMap is not configured or unavailable', async () => {
    await assert.rejects(
      () => autocomplete('216', {}, { apiKey: '', fetch: async () => assert.fail('fetch') }),
      (err) => err instanceof ApiError && err.statusCode === 503
    );
    await assert.rejects(
      () => reverse(10.045, 105.746, {
        apiKey: KEY,
        fetch: async () => ({ ok: false, status: 502, text: async () => 'upstream down' }),
      }),
      (err) => err instanceof ApiError && err.statusCode === 502 && err.details.providerStatus === 502
    );
    await assert.rejects(
      () => autocomplete('600 Nguyễn Văn Cừ', { lat: 10.045, lng: 105.746 }, {
        apiKey: KEY,
        fetch: async () => ({ ok: false, status: 423, text: async () => `limited apikey=${KEY}` }),
      }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 423);
        assert.match(err.message, /quota|chưa được bật/);
        assert.equal(String(err.message).includes(KEY), false);
        assert.equal(err.details.code, 'VIETMAP_UNAVAILABLE');
        assert.equal(err.details.providerStatus, 423);
        return true;
      }
    );
  });
});
