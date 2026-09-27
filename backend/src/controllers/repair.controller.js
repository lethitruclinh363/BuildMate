const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { publicFileUrl } = require('../middleware/upload.middleware');
const repairService = require('../services/repair.service');

function collectMedia(files = {}) {
  const images = (files.images || []).map((f) => publicFileUrl(f.path));
  const videos = (files.videos || []).map((f) => publicFileUrl(f.path));
  return { images, videos };
}

const create = asyncHandler(async (req, res) => {
  const media = collectMedia(req.files);
  const data = await repairService.createRequest(req.user.id, { ...req.body, ...media });
  return created(res, data, 'Repair request submitted');
});

const mine = asyncHandler(async (req, res) => {
  const data = await repairService.listMine(req.user.id);
  return success(res, data, 'Your repair requests');
});

const received = asyncHandler(async (req, res) => {
  const data = await repairService.listReceived(req.user.id);
  return success(res, data, 'Incoming repair requests');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await repairService.getById(req.params.id, req.user);
  return success(res, data, 'Repair request retrieved');
});

const accept = asyncHandler(async (req, res) => {
  const data = await repairService.setStatus(req.params.id, req.user.id, 'ACCEPTED');
  return success(res, data, 'Request accepted');
});

const reject = asyncHandler(async (req, res) => {
  const data = await repairService.setStatus(req.params.id, req.user.id, 'REJECTED');
  return success(res, data, 'Request declined');
});

module.exports = { create, mine, received, getOne, accept, reject };
