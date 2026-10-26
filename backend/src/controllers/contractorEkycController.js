const fs = require('fs');
const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const contractorEkycService = require('../services/contractorEkycService');

const current = asyncHandler(async (req, res) => {
  const data = await contractorEkycService.getForUser(req.user.id);
  return success(res, data, 'Identity verification retrieved');
});

const saveDocument = asyncHandler(async (req, res) => {
  const data = await contractorEkycService.saveCard(
    req.user.id,
    req.contractorProfile,
    req.body.type,
    req.file
  );
  return success(res, data, 'Identity document saved');
});

const readiness = asyncHandler(async (req, res) => {
  const data = await contractorEkycService.checkReadiness(
    req.user.id,
    req.contractorProfile,
    req.file
  );
  return success(res, data, 'Face readiness checked');
});

const validateFrame = asyncHandler(async (req, res) => {
  const files = req.files || {};
  const data = await contractorEkycService.validateFrame(
    req.user.id,
    req.contractorProfile,
    {
      frame: files.frame_image?.[0],
      reference: files.reference_image?.[0],
      opposite: files.opposite_image?.[0],
    },
    req.body.step
  );
  return success(res, data, 'Face frame checked');
});

const processVerification = asyncHandler(async (req, res) => {
  const files = req.files || {};
  const data = await contractorEkycService.processVerification(req.user.id, req.contractorProfile, {
    selfie: files.selfie_image?.[0],
    left: files.left_image?.[0],
    right: files.right_image?.[0],
    up: files.up_image?.[0],
    down: files.down_image?.[0],
  });
  return success(res, data, 'Identity verification processed');
});

const submit = asyncHandler(async (req, res) => {
  const data = await contractorEkycService.submit(req.user.id, req.contractorProfile);
  return success(res, data, 'Identity verification submitted');
});

const file = asyncHandler(async (req, res, next) => {
  const opened = await contractorEkycService.openForOwner(req.user.id, req.params.kind);
  res.setHeader('Content-Type', opened.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(opened.full);
  stream.on('error', (err) => {
    if (!res.headersSent) return next(err);
    res.end();
  });
  stream.pipe(res);
});

const adminFile = asyncHandler(async (req, res, next) => {
  const opened = await contractorEkycService.openForAdmin(req.params.id, req.params.kind);
  res.setHeader('Content-Type', opened.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(opened.full);
  stream.on('error', (err) => {
    if (!res.headersSent) return next(err);
    res.end();
  });
  stream.pipe(res);
});

const retake = asyncHandler(async (req, res) => {
  const data = await contractorEkycService.requestRetake(req.params.id, req.user.id, req.body.reason);
  return success(res, data, 'Identity verification must be retaken');
});

module.exports = {
  current,
  saveDocument,
  readiness,
  validateFrame,
  processVerification,
  submit,
  file,
  adminFile,
  retake,
};
