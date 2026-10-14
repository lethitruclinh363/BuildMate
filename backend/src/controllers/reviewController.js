const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const reviewService = require('../services/reviewService');

const create = asyncHandler(async (req, res) => {
  const data = await reviewService.createReview(req.user.id, req.body);
  return success(res, data, 'Review created', 201);
});

const createMaterial = asyncHandler(async (req, res) => {
  const data = await reviewService.createMaterialStoreReview(req.user.id, req.body);
  return success(res, data, 'Review created', 201);
});

const listStore = asyncHandler(async (req, res) => {
  const data = await reviewService.listStoreReviews(req.user.id, req.query);
  return success(res, data, 'Reviews loaded');
});

const listForUser = asyncHandler(async (req, res) => {
  const data = await reviewService.listForUser(req.params.id, req.query.targetType);
  return success(res, data, 'Reviews retrieved');
});

const reply = asyncHandler(async (req, res) => {
  const data = await reviewService.replyToReview(req.user.id, req.params.id, req.body.reply);
  return success(res, data, 'Reply saved');
});

const report = asyncHandler(async (req, res) => {
  const data = await reviewService.reportReview(req.user.id, req.params.id, req.body.reason);
  return success(res, data, 'Review reported');
});

module.exports = { create, createMaterial, listStore, listForUser, reply, report };
