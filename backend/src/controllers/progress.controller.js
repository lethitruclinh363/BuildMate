const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const progressService = require('../services/progress.service');
const { publicFileUrl } = require('../middleware/upload.middleware');

const list = asyncHandler(async (req, res) => {
  const data = await progressService.listProgress(req.params.id, req.user);
  return success(res, data, 'Progress retrieved');
});

const create = asyncHandler(async (req, res) => {
  const uploaded = (req.files || []).map((file) => publicFileUrl(file.path));
  const images = [...uploaded, ...[].concat(req.body.images || [])].filter(Boolean);
  const data = await progressService.addProgress(req.params.id, req.user, {
    status: req.body.status,
    description: req.body.description,
    images,
    lat: req.body.lat,
    lng: req.body.lng,
  });
  return created(res, data, 'Progress recorded');
});

module.exports = { list, create };
