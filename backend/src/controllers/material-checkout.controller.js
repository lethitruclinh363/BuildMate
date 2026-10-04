const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const checkoutService = require('../services/material-checkout.service');

const quote = asyncHandler(async (req, res) => {
  const data = await checkoutService.quote(req.body);
  return success(res, data, 'Delivery quote calculated');
});

module.exports = { quote };
