const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const locationService = require('../services/location.service');

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

module.exports = { nearbyStores, nearbyContractors };
