const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const materialService = require('../services/materialService');
const materialService = require('../services/material.service');
const materialCategoryService = require('../services/material-category.service');
const publicProfileService = require('../services/public-profile.service');

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

const listCategories = asyncHandler(async (req, res) => {
  const data = await materialCategoryService.listForOwner(req.user.id);
  return success(res, data, 'Material categories retrieved');
});

const checkCategory = asyncHandler(async (req, res) => {
  const data = await materialCategoryService.checkCategory(req.user.id, req.query.name);
  return success(res, data, 'Material category checked');
});

const createCategory = asyncHandler(async (req, res) => {
  const data = await materialCategoryService.createCustomCategory({ name: req.body.name, userId: req.user.id });
  return created(res, data, 'Custom category added');
});

const registerCategory = asyncHandler(async (req, res) => {
  const data = await materialCategoryService.registerStoreCategory(req.user.id, req.body.name);
  return created(res, data, 'Category registered');
});

const getPublicProfile = asyncHandler(async (req, res) => {
  const data = await publicProfileService.getMaterialPublicProfile(req.user.id);
  return success(res, data, 'Public profile retrieved');
});

const updatePublicProfile = asyncHandler(async (req, res) => {
  const data = await publicProfileService.updateMaterialPublicProfile(req.user.id, req.body);
  return success(res, data, 'Public profile updated');
});

module.exports = {
  list,
  create,
  update,
  remove,
  listCategories,
  checkCategory,
  createCategory,
  registerCategory,
  getPublicProfile,
  updatePublicProfile,
};
