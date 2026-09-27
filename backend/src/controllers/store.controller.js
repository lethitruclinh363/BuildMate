const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { STORE_TYPE } = require('../models/Store');
const storeService = require('../services/store.service');

function lockedType(req) {
  return req.user.role === 'MATERIAL_STORE_OWNER' ? STORE_TYPE.MATERIALS : STORE_TYPE.SERVICES;
}

const getStore = asyncHandler(async (req, res) => {
  const data = await storeService.enforceStoreType(req.user.id, lockedType(req));
  return success(res, data, 'Storefront retrieved');
});

const createStore = asyncHandler(async (req, res) => {
  const data = await storeService.createStore(req.user.id, req.body, lockedType(req));
  return created(res, data, 'Storefront created');
});

const updateStore = asyncHandler(async (req, res) => {
  const data = await storeService.updateStore(req.user.id, req.body, lockedType(req));
  return success(res, data, 'Storefront updated');
});

const deleteStore = asyncHandler(async (req, res) => {
  const data = await storeService.deleteStore(req.user.id);
  return success(res, data, 'Storefront removed');
});

module.exports = { getStore, createStore, updateStore, deleteStore };
