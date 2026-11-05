const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const reviewService = require('../services/reviewService');

const create = asyncHandler(async (req, res) => {
  const data = await reviewService.createReview(req.user.id, req.body);
  return success(res, data, 'Review created', 201);
});

const listStore = asyncHandler(async (req, res) => {
  const data = await reviewService.listStoreReviews(req.user.id, req.query);
  return success(res, data, 'Reviews loaded');
});

function publicReview(row) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment || '',
    createdAt: row.createdAt,
    customerName: row.customerName || '',
    customerAvatar: row.customerAvatar || '',
    contractorReply: row.contractorReply || '',
    repliedAt: row.repliedAt || null,
  };
}

const listForUser = asyncHandler(async (req, res) => {
  const targetType = String(req.query.targetType || '');
  if (targetType === 'CONTRACTOR' || targetType === 'MATERIAL_STORE') {
    const data = targetType === 'CONTRACTOR'
      ? await reviewService.listContractorReviews(req.params.id, req.query)
      : await reviewService.listStoreReviews(req.params.id, req.query);
    return success(res, {
      average: data.average,
      count: data.count,
      distribution: data.distribution,
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
      items: (data.items || []).map(publicReview),
    }, 'Reviews retrieved');
  }
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

module.exports = { create, listStore, listForUser, reply, report };
