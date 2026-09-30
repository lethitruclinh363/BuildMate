const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const marketplaceService = require('../services/marketplace.service');

const getStore = asyncHandler(async (req, res) => {
  const data = await marketplaceService.getPublicStore(req.params.id);
  return success(res, data, 'Store retrieved');
});

const getContractor = asyncHandler(async (req, res) => {
  const data = await marketplaceService.getPublicContractor(req.params.id);
  return success(res, data, 'Contractor retrieved');
});

const searchMaterials = asyncHandler(async (req, res) => {
  const data = await marketplaceService.searchMaterials(req.query);
  return success(res, data, 'Materials retrieved');
});

const searchServices = asyncHandler(async (req, res) => {
  const data = await marketplaceService.searchServices(req.query);
  return success(res, data, 'Services retrieved');
});

module.exports = { getStore, getContractor, searchMaterials, searchServices };
