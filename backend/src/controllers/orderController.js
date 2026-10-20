const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const orderService = require('../services/orderService');

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

const confirmRemaining = asyncHandler(async (req, res) => {
  const escrowService = require('../services/escrowService');
  const data = await escrowService.confirmRemaining(req.params.id, req.user);
  return success(res, data, 'Direct remaining payment recorded');
});

const settleEscrow = asyncHandler(async (req, res) => {
  const escrowService = require('../services/escrowService');
  const data = await escrowService.settle(req.params.id, req.user);
  return success(res, data, 'Mock escrow settlement recorded');
});

const adminRefundEscrow = asyncHandler(async (req, res) => {
  const escrowService = require('../services/escrowService');
  const data = await escrowService.adminRefund(
    req.params.id,
    req.user,
    req.body.reason,
    req.body.cancelCase,
    req.body.amount
  );
  return success(res, data, 'Mock escrow refund recorded');
});

module.exports = {
  listCustomer,
  listContractor,
  getOne,
  complete,
  cancel,
  confirmRemaining,
  settleEscrow,
  adminRefundEscrow,
};
