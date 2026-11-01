const fs = require('fs');
const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { publicFileUrl } = require('../middleware/uploadMiddleware');
const { requireRepairSiteImages } = require('../utils/upload');
const repairService = require('../services/repairService');

function sweepUploadedFiles(files = {}) {
  const list = [...(files.images || []), ...(files.videos || [])];
  list.forEach((file) => {
    if (!file?.path) return;
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* already removed */
    }
  });
}

function collectMedia(files = {}) {
  const checked = requireRepairSiteImages(files);
  return {
    images: checked.images.map((f) => publicFileUrl(f.path)),
    videos: (checked.videos || []).map((f) => publicFileUrl(f.path)),
  };
}

const create = asyncHandler(async (req, res) => {
  let media;
  try {
    media = collectMedia(req.files);
  } catch (err) {
    sweepUploadedFiles(req.files);
    throw err;
  }
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

const cancel = asyncHandler(async (req, res) => {
  const data = await repairService.cancelPending(req.params.id, req.user.id);
  return success(res, data, 'Request cancelled');
});

module.exports = { create, mine, received, getOne, accept, reject, cancel, collectMedia, sweepUploadedFiles };
