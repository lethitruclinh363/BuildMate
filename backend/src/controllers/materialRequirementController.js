const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const service = require('../services/material-requirement.service');

const create = asyncHandler(async (req, res) => {
  const data = await service.createList(req.user, req.body);
  return created(res, data, 'Material requirement list created');
});

const mine = asyncHandler(async (req, res) => {
  const data = await service.listMine(req.user);
  return success(res, data, 'Material requirement lists retrieved');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await service.getOne(req.user, req.params.id);
  return success(res, data, 'Material requirement list retrieved');
});

const addItem = asyncHandler(async (req, res) => {
  const data = await service.addItem(req.user, req.params.id, req.body);
  return created(res, data, 'Item added');
});

const updateItem = asyncHandler(async (req, res) => {
  const data = await service.updateItem(req.user, req.params.id, req.params.itemId, req.body);
  return success(res, data, 'Item updated');
});

const removeItem = asyncHandler(async (req, res) => {
  const data = await service.removeItem(req.user, req.params.id, req.params.itemId);
  return success(res, data, 'Item removed');
});

const send = asyncHandler(async (req, res) => {
  const data = await service.sendToStore(req.user, req.params.id, req.body.storeId);
  return success(res, data, 'Material requirement list sent');
});

const cancel = asyncHandler(async (req, res) => {
  const data = await service.cancelList(req.user, req.params.id);
  return success(res, data, 'Material requirement list cancelled');
});

const catalog = asyncHandler(async (req, res) => {
  const data = await service.suggestCatalog(req.user, req.params.id);
  return success(res, data, 'Catalog matches retrieved');
});

const eligibleStores = asyncHandler(async (req, res) => {
  const data = await service.listEligibleStores(req.user, req.params.id);
  return success(res, data, 'Eligible material stores retrieved');
});

const quote = asyncHandler(async (req, res) => {
  const data = await service.createStoreQuote(req.user, req.params.id, req.body);
  return created(res, data, 'Material quote sent');
});

const confirm = asyncHandler(async (req, res) => {
  const data = await service.confirmQuote(req.user, req.params.id);
  return success(res, data, 'Material quote confirmed');
});

module.exports = {
  create,
  mine,
  getOne,
  addItem,
  updateItem,
  removeItem,
  send,
  cancel,
  catalog,
  eligibleStores,
  quote,
  confirm,
};
