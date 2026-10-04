const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const locationService = require('../services/locationService');
const locationService = require('../services/location.service');
const geocodingService = require('../services/geocoding.service');

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

const geocode = asyncHandler(async (req, res) => {
  const data = await geocodingService.geocodeAddress(req.query.q);
  return success(res, data, 'Addresses retrieved');
});

const reverse = asyncHandler(async (req, res) => {
  const data = await geocodingService.reverseGeocode(req.query.lat, req.query.lng);
  return success(res, data, 'Address retrieved');
});

module.exports = { nearbyStores, nearbyContractors, geocode, reverse };
