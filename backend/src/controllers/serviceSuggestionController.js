const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const serviceSuggestionService = require('../services/serviceSuggestionService');

const create = asyncHandler(async (req, res) => {
  const data = await serviceSuggestionService.createSuggestion({
    description: req.body.description,
    user: req.user,
    profile: req.contractorProfile,
  });
  return success(res, data, 'Service suggestion sent', 201);
});

const list = asyncHandler(async (_req, res) => {
  const data = await serviceSuggestionService.listForAdmin();
  return success(res, data, 'Service suggestions retrieved');
});

const reject = asyncHandler(async (req, res) => {
  const data = await serviceSuggestionService.rejectSuggestion(req.params.id, {
    adminNote: req.body.adminNote,
    adminId: req.user.id,
  });
  return success(res, data, 'Service suggestion rejected');
});

const convert = asyncHandler(async (req, res) => {
  const data = await serviceSuggestionService.convertSuggestion(req.params.id, req.body, req.user.id);
  return success(res, data, 'Service created from suggestion', 201);
});

module.exports = { create, list, reject, convert };
