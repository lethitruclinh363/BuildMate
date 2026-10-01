const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { publicFileUrl } = require('../middleware/upload.middleware');
const contractorService = require('../services/contractor.service');
const publicProfileService = require('../services/public-profile.service');
const reviewService = require('../services/review.service');
const catalogService = require('../services/catalog.service');
const serviceService = require('../services/service.service');
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

const getPublicProfile = asyncHandler(async (req, res) => {
  const data = await publicProfileService.getPublicProfile(req.user.id);
  return success(res, data, 'Public profile loaded');
});

const updatePublicProfile = asyncHandler(async (req, res) => {
  const data = await publicProfileService.updatePublicProfile(req.user.id, req.body);
  return success(res, data, 'Public profile saved');
});

const getProfile = asyncHandler(async (req, res) => {
  const data = await contractorService.getProfile(req.user.id);
  return success(res, data, 'Partner profile retrieved');
});

const updateProfile = asyncHandler(async (req, res) => {
  const data = await contractorService.updateProfile(req.user.id, req.body);
  return success(res, data, 'Partner profile saved');
});

const uploadPortfolio = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a file to upload');
  const data = await contractorService.addPortfolioFile(req.user.id, {
    url: publicFileUrl(req.file.path),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  }, req.body.slot);
  return created(res, data, 'Portfolio file uploaded');
});

const removePortfolio = asyncHandler(async (req, res) => {
  const data = await contractorService.removePortfolioFile(req.user.id, req.body.slot, req.body.url);
  return success(res, data, 'Portfolio file removed');
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

const requestVerificationChange = asyncHandler(async (req, res) => {
  const data = await contractorService.requestVerificationChange(req.user.id, req.body.note);
  return success(res, data, 'Verification update requested');
});

const submitVerification = asyncHandler(async (req, res) => {
  const data = await contractorService.submitVerification(req.user.id, req.body);
  return success(res, data, 'Application submitted for review');
});

const checkServiceCatalog = asyncHandler(async (req, res) => {
  const data = await catalogService.classifyName(req.query.name);
  return success(res, data, 'Service name checked');
});

const listServiceCatalog = asyncHandler(async (_req, res) => {
  const data = await catalogService.listActive();
  return success(res, data, 'Service catalog retrieved');
});

const createCustomService = asyncHandler(async (req, res) => {
  const proposal = await catalogService.createCustomService({
    name: req.body.name,
    category: req.body.category,
    description: req.body.description,
    userId: req.user.id,
  });
  const data = await serviceService.attachCustomProposal(req.user.id, proposal);
  return created(res, data, 'Custom service submitted');
});

const getReputation = asyncHandler(async (req, res) => {
  const [reviews, highlights] = await Promise.all([
    reviewService.listForUser(req.user.id, 'CONTRACTOR'),
    publicProfileService.loadPublicHighlights(req.user.id),
  ]);
  return success(res, { reviews, highlights }, 'Reputation loaded');
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboardStats(req.user.id);
  return success(res, data, 'Dashboard stats loaded');
});

module.exports = {
  getWorkspace,
  getMaterialWorkspace,
  getPublicProfile,
  updatePublicProfile,
  getProfile,
  updateProfile,
  uploadDocument,
  uploadPortfolio,
  removePortfolio,
  removeDocument,
  submitVerification,
  requestVerificationChange,
  checkServiceCatalog,
  listServiceCatalog,
  createCustomService,
  getDashboardStats,
  getReputation,
};
