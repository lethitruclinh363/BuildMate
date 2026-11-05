const fs = require('fs');
const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { publicFileUrl } = require('../middleware/uploadMiddleware');
const { isSensitiveDocumentType, privateDocumentUrl } = require('../utils/verification-docs');
const verificationStorage = require('../services/verificationStorage');
const contractorService = require('../services/contractorService');
const publicProfileService = require('../services/publicProfileService');
const reviewService = require('../services/reviewService');
const catalogService = require('../services/catalogService');
const serviceService = require('../services/serviceService');
const dashboardService = require('../services/contractorDashboard.service');
const activationService = require('../services/activation.service');
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

const createPortfolioProject = asyncHandler(async (req, res) => {
  const data = await contractorService.createPortfolioProject(req.user.id);
  return created(res, data, 'Project added');
});

const updatePortfolioProject = asyncHandler(async (req, res) => {
  const data = await contractorService.updatePortfolioProject(req.user.id, req.params.projectId, req.body);
  return success(res, data, 'Project saved');
});

const deletePortfolioProject = asyncHandler(async (req, res) => {
  const data = await contractorService.deletePortfolioProject(req.user.id, req.params.projectId);
  return success(res, data, 'Project removed');
});

const uploadProjectImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Choose a file to upload');
  const data = await contractorService.addProjectImage(req.user.id, req.params.projectId, {
    url: publicFileUrl(req.file.path),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
  return created(res, data, 'Project image uploaded');
});

const removeProjectImage = asyncHandler(async (req, res) => {
  const data = await contractorService.removeProjectImage(req.user.id, req.params.projectId, req.body.url);
  return success(res, data, 'Project image removed');
});

const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Choose a file to upload');
  }
  let url = publicFileUrl(req.file.path);
  if (isSensitiveDocumentType(req.body.type)) {
    const relative = verificationStorage.saveFromDisk(req.user.id, req.file.path, req.file.mimetype);
    url = privateDocumentUrl(relative);
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* public copy already moved */
    }
  }
  const data = await contractorService.addDocument(req.user.id, {
    url,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  }, req.body.type);
  return created(res, data, 'Document uploaded');
});

const serveDocument = asyncHandler(async (req, res, next) => {
  const opened = await contractorService.openDocumentFile(req.user.id, req.params.documentId, req.user);
  res.setHeader('Content-Type', opened.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(opened.full);
  stream.on('error', (err) => {
    if (!res.headersSent) return next(err);
    res.end();
  });
  stream.pipe(res);
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

const getReviews = asyncHandler(async (req, res) => {
  const data = await reviewService.listContractorReviews(req.user.id, req.query);
  return success(res, data, 'Reviews loaded');
});

const activatePartner = asyncHandler(async (req, res) => {
  const data = await activationService.activate(req.user.id);
  return success(res, data, 'Partner activated');
});

const pausePartner = asyncHandler(async (req, res) => {
  const data = await activationService.pause(req.user.id);
  return success(res, data, 'Partner paused');
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
  serveDocument,
  uploadPortfolio,
  removePortfolio,
  createPortfolioProject,
  updatePortfolioProject,
  deletePortfolioProject,
  uploadProjectImage,
  removeProjectImage,
  removeDocument,
  submitVerification,
  requestVerificationChange,
  checkServiceCatalog,
  listServiceCatalog,
  createCustomService,
  getDashboardStats,
  getReviews,
  activatePartner,
  pausePartner,
};
