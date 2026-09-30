const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const paymentService = require('../services/payment.service');
const commissionService = require('../services/commission.service');

const checkout = asyncHandler(async (req, res) => {
  const data = await paymentService.checkout(req.params.id, req.user, req.body);
  return success(res, data, 'Checkout started');
});

const mockSuccess = asyncHandler(async (req, res) => {
  const data = await paymentService.mockSuccess(req.params.id, req.user);
  return success(res, data, 'Payment captured');
});

const listForOrder = asyncHandler(async (req, res) => {
  const data = await paymentService.listForOrder(req.params.orderId, req.user);
  return success(res, data, 'Payments retrieved');
});

const refund = asyncHandler(async (req, res) => {
  const data = await paymentService.refund(req.params.id, req.user.id, req.body.reason);
  return success(res, data, 'Payment refunded');
});

const earnings = asyncHandler(async (req, res) => {
  const data = await commissionService.earningsForContractor(req.user.id);
  return success(res, data, 'Earnings retrieved');
});

module.exports = { checkout, mockSuccess, listForOrder, refund, earnings };
