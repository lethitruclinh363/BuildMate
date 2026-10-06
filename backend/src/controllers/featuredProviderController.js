const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const featuredProviderService = require('../services/featuredProvider.service');

const featured = asyncHandler(async (_req, res) => {
  const data = await featuredProviderService.getFeaturedProviders();
  return success(res, data, 'Featured providers retrieved');
});

module.exports = { featured };
