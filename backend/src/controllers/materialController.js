const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const materialService = require('../services/materialService');

const list = asyncHandler(async (req, res) => {
  const data = await materialService.listMaterials(req.store._id);
  return success(res, data, 'Materials retrieved');
});

const create = asyncHandler(async (req, res) => {
  const data = await materialService.createMaterial(req.store._id, req.body);
  return created(res, data, 'Material added');
});

const update = asyncHandler(async (req, res) => {
  const data = await materialService.updateMaterial(req.store._id, req.params.id, req.body);
  return success(res, data, 'Material updated');
});

const remove = asyncHandler(async (req, res) => {
  const data = await materialService.deleteMaterial(req.store._id, req.params.id);
  return success(res, data, 'Material removed');
});

module.exports = { list, create, update, remove };
