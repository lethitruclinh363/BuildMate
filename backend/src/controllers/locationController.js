const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const locationService = require('../services/locationService');
const vietmapService = require('../services/vietmap.service');
const locationCorrection = require('../services/locationCorrection.service');

const nearbyStores = asyncHandler(async (req, res) => {
  const { lat, lng, radius, category, minRating, storeType } = req.query;
  const data = await locationService.nearbyStores({
    lat,
    lng,
    radiusKm: radius,
    category,
    minRating,
    storeType,
  });
  return success(res, data, 'Nearby stores retrieved');
});

const nearbyContractors = asyncHandler(async (req, res) => {
  const { lat, lng, radius, category, minRating, storeType } = req.query;
  const data = await locationService.nearbyContractors({
    lat,
    lng,
    radiusKm: radius,
    category,
    minRating,
    storeType,
  });
  return success(res, data, 'Nearby contractors retrieved');
});

const autocomplete = asyncHandler(async (req, res) => {
  const data = await vietmapService.autocomplete(req.query.q, {
    lat: req.query.focusLat,
    lng: req.query.focusLng,
  });
  return success(res, data, 'Addresses retrieved');
});

const place = asyncHandler(async (req, res) => {
  const hit = await vietmapService.place(req.query.refId);
  let data = hit;
  try {
    data = await locationCorrection.prefer(hit);
  } catch (err) {
    console.error('[LocationCorrection] status=lookup message=unavailable');
  }
  return success(res, data, 'Place retrieved');
});

const reverse = asyncHandler(async (req, res) => {
  const data = await vietmapService.reverse(req.query.lat, req.query.lng);
  return success(res, data, 'Address retrieved');
});

module.exports = { nearbyStores, nearbyContractors, autocomplete, place, reverse };
