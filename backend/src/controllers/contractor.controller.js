const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { publicFileUrl } = require('../middleware/upload.middleware');
const contractorService = require('../services/contractor.service');
const dashboardService = require('../services/contractorDashboard.service');
const { ApiError } = require('../utils/ApiError');

const getWorkspace = asyncHandler(async (req, res) => {
  const data = await contractorService.getWorkspace(req.user.id);
  return success(res, data, 'Workspace loaded');
});

const getMaterialWorkspace = asyncHandler(async (req, res) => {
  const data = await contractorService.getMaterialWorkspace(req.user.id);
  return success(res, data, 'Workspace loaded');
});

const getProfile = asyncHandler(async (req, res) => {
  const data = await contractorService.getProfile(req.user.id);
  return success(res, data, 'Partner profile retrieved');
});

const updateProfile = asyncHandler(async (req, res) => {
  const data = await contractorService.updateProfile(req.user.id, req.body);
  return success(res, data, 'Partner profile saved');
});

const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Choose a file to upload');
  }
  const data = await contractorService.addDocument(req.user.id, {
    url: publicFileUrl(req.file.path),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  }, req.body.type);
  return created(res, data, 'Document uploaded');
});

const removeDocument = asyncHandler(async (req, res) => {
  const data = await contractorService.removeDocument(req.user.id, req.params.documentId);
  return success(res, data, 'Document removed');
});

const submitVerification = asyncHandler(async (req, res) => {
  const data = await contractorService.submitVerification(req.user.id);
  return success(res, data, 'Application submitted for review');
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboardStats(req.user.id);
  return success(res, data, 'Dashboard stats loaded');
});

module.exports = {
  getWorkspace,
  getMaterialWorkspace,
  getProfile,
  updateProfile,
  uploadDocument,
  removeDocument,
  submitVerification,
  getDashboardStats,
};
