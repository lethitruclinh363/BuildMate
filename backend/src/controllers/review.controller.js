const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const reviewService = require('../services/review.service');

const create = asyncHandler(async (req, res) => {
  const data = await reviewService.createReview(req.user.id, req.body);
  return success(res, data, 'Review created', 201);
});

const listForUser = asyncHandler(async (req, res) => {
  const data = await reviewService.listForUser(req.params.id, req.query.targetType);
  return success(res, data, 'Reviews retrieved');
});

module.exports = { create, listForUser };
