const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const locationChangeService = require('../services/locationChange.service');

const getEligibility = asyncHandler(async (req, res) => {
  const data = await locationChangeService.checkEligibility(req.user.id, req.user.role);
  return success(res, data, 'Location change eligibility checked');
});

const createRequest = asyncHandler(async (req, res) => {
  const data = await locationChangeService.requestLocationChange(req.user.id, req.user.role, req.body);
  return created(res, data, 'Location change request submitted');
});

const listMyRequests = asyncHandler(async (req, res) => {
  const data = await locationChangeService.getPartnerRequests(req.user.id, req.user.role);
  return success(res, data, 'Location change requests retrieved');
});

const adminListRequests = asyncHandler(async (req, res) => {
  const data = await locationChangeService.adminListRequests(req.query);
  return success(res, data, 'Location change requests retrieved');
});

const adminGetRequest = asyncHandler(async (req, res) => {
  const data = await locationChangeService.adminGetRequest(req.params.id);
  return success(res, data, 'Location change request retrieved');
});

const adminApproveRequest = asyncHandler(async (req, res) => {
  const data = await locationChangeService.adminApproveRequest(
    req.params.id,
    req.user.id,
    req.body?.adminNote
  );
  return success(res, data, 'Location change request approved');
});

const adminRejectRequest = asyncHandler(async (req, res) => {
  const data = await locationChangeService.adminRejectRequest(
    req.params.id,
    req.user.id,
    req.body.reason
  );
  return success(res, data, 'Location change request rejected');
});

module.exports = {
  getEligibility,
  createRequest,
  listMyRequests,
  adminListRequests,
  adminGetRequest,
  adminApproveRequest,
  adminRejectRequest,
};
