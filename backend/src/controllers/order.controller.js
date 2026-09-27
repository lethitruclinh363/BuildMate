const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const orderService = require('../services/order.service');

const listCustomer = asyncHandler(async (req, res) => {
  const data = await orderService.listForCustomer(req.user.id);
  return success(res, data, 'Customer orders retrieved');
});

const listContractor = asyncHandler(async (req, res) => {
  const data = await orderService.listForContractor(req.user.id);
  return success(res, data, 'Contractor orders retrieved');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await orderService.getOrder(req.params.id, req.user);
  return success(res, data, 'Order retrieved');
});

const complete = asyncHandler(async (req, res) => {
  const data = await orderService.completeOrder(req.params.id, req.user.id);
  return success(res, data, 'Order completed');
});

const cancel = asyncHandler(async (req, res) => {
  const data = await orderService.cancelOrder(req.params.id, req.user, req.body.reason);
  return success(res, data, 'Order cancelled');
});

module.exports = { listCustomer, listContractor, getOne, complete, cancel };
