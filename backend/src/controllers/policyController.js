const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const policyService = require('../services/policy.service');

const list = asyncHandler(async (req, res) => {
  const data = await policyService.listPolicies(req.query);
  return success(res, data, 'OK');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await policyService.getPolicy(req.params.id);
  return success(res, data, 'OK');
});

const active = asyncHandler(async (req, res) => {
  const data = await policyService.getActivePolicy(req.query.type, req.query.language);
  return success(res, data, 'OK');
});

const create = asyncHandler(async (req, res) => {
  const data = await policyService.createPolicy(req.body, req.user, req);
  return created(res, data, 'Policy created');
});

const update = asyncHandler(async (req, res) => {
  const data = await policyService.updatePolicy(req.params.id, req.body, req.user, req);
  return success(res, data, 'Policy updated');
});

const history = asyncHandler(async (req, res) => {
  const data = await policyService.history(req.params.id);
  return success(res, data, 'OK');
});

module.exports = { list, getOne, active, create, update, history };
