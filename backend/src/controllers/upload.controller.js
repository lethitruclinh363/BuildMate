const { asyncHandler } = require('../utils/asyncHandler');
const { created } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const { publicFileUrl, UPLOAD_SCOPES } = require('../middleware/upload.middleware');

const create = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'File is required');
  const scope = UPLOAD_SCOPES[req.params.scope] || 'users';
  return created(
    res,
    {
      url: publicFileUrl(req.file.path),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      scope,
    },
    'File uploaded'
  );
});

module.exports = { create };
