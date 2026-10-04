const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const orderService = require('../services/material-order.service');
const depositService = require('../services/material-deposit.service');

const createOrder = asyncHandler(async (req, res) => {
  const data = await orderService.create(req.user, req.body);
  return created(res, data, 'Material order created');
});

const listMine = asyncHandler(async (req, res) => {
  const data = await orderService.listMine(req.user);
  return success(res, data, 'Material orders retrieved');
});

const getMine = asyncHandler(async (req, res) => {
  const data = await orderService.getForCustomer(req.user, req.params.id);
  return success(res, data, 'Material order retrieved');
});

const cancelMine = asyncHandler(async (req, res) => {
  const data = await orderService.cancelMine(req.user, req.params.id);
  return success(res, data, 'Material order cancelled');
});

const checkoutDeposit = asyncHandler(async (req, res) => {
  const data = await depositService.checkout(req.user, req.params.id);
  return success(res, data, 'Deposit checkout started');
});

const captureDeposit = asyncHandler(async (req, res) => {
  const data = await depositService.capture(req.user, req.params.id);
  return success(res, data, 'Deposit payment captured');
});

const receiveMine = asyncHandler(async (req, res) => {
  const data = await orderService.receiveMine(req.user, req.params.id);
  return success(res, data, 'Material order received');
});

const listStore = asyncHandler(async (req, res) => {
  const data = await orderService.listForStore(req.store);
  return success(res, data, 'Store material orders retrieved');
});

const getStore = asyncHandler(async (req, res) => {
  const data = await orderService.getForStore(req.store, req.params.id);
  return success(res, data, 'Store material order retrieved');
});

const earnings = asyncHandler(async (req, res) => {
  const data = await orderService.earningsForStore(req.store);
  return success(res, data, 'Material store earnings retrieved');
});

const settleRemaining = asyncHandler(async (req, res) => {
  const data = await orderService.settleRemaining(req.user, req.params.id);
  return success(res, data, 'Direct remaining payment recorded');
});

const updateStoreStatus = asyncHandler(async (req, res) => {
  const data = await orderService.updateStoreStatus(req.store, req.user, req.params.id, req.body);
  return success(res, data, 'Material order status updated');
});

module.exports = {
  createOrder,
  listMine,
  getMine,
  cancelMine,
  checkoutDeposit,
  captureDeposit,
  receiveMine,
  listStore,
  getStore,
  earnings,
  settleRemaining,
  updateStoreStatus,
};
