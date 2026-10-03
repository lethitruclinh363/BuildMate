const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const complaintService = require('../services/complaintService');

const create = asyncHandler(async (req, res) => {
  const data = await complaintService.createComplaint(req.user, req.body);
  return success(res, data, 'Complaint opened', 201);
});

const mine = asyncHandler(async (req, res) => {
  const data = await complaintService.listMine(req.user.id);
  return success(res, data, 'Complaints retrieved');
});

const adminList = asyncHandler(async (req, res) => {
  const data = await complaintService.listAdmin(req.query.status);
  return success(res, data, 'Complaints retrieved');
});

const adminPatch = asyncHandler(async (req, res) => {
  const data = await complaintService.adminUpdate(req.params.id, req.user.id, req.body);
  return success(res, data, 'Complaint updated');
});

module.exports = { create, mine, adminList, adminPatch };
