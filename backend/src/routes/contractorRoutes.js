const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  loadContractorProfile,
  requireApprovedContractor,
  loadStore,
  requireStore,
} = require('../middleware/contractorMiddleware');
const { verificationUpload, storeUpload, ekycMemoryUpload } = require('../middleware/uploadMiddleware');
const { validate } = require('../utils/validator');
const {
  profileSchema,
  publicProfileSchema,
  verificationChangeSchema,
  documentTypeSchema,
  portfolioSlotSchema,
  portfolioRemoveSchema,
  portfolioProjectSchema,
  projectImageRemoveSchema,
  submitSchema,
  storeSchema,
  registerServiceSchema,
  offeringUpdateSchema,
  catalogCheckSchema,
  catalogCreateSchema,
  locationChangeRequestSchema,
} = require('../validators/partner.validator');
const { reviewListQuerySchema } = require('../validators/finance.validator');
const contractorController = require('../controllers/contractorController');
const contractorEkycController = require('../controllers/contractorEkycController');
const storeController = require('../controllers/storeController');
const serviceController = require('../controllers/serviceController');
const paymentController = require('../controllers/paymentController');
const locationChangeController = require('../controllers/locationChange.controller');

const router = express.Router();
const contractorOnly = [authenticate, authorize(ROLES.CONTRACTOR), loadContractorProfile];
const storeWrite = [...contractorOnly, requireApprovedContractor];
const catalogWrite = [...storeWrite, requireStore];

router.get('/earnings', authenticate, authorize(ROLES.CONTRACTOR), paymentController.earnings);

router.get('/dashboard-stats', ...contractorOnly, contractorController.getDashboardStats);
router.get('/reputation', ...contractorOnly, contractorController.getReputation);
router.get('/reviews', ...contractorOnly, validate(reviewListQuerySchema, 'query'), contractorController.getReviews);
router.get('/workspace', ...contractorOnly, contractorController.getWorkspace);
router.post('/activation', ...contractorOnly, contractorController.activatePartner);
router.post('/activation/pause', ...contractorOnly, contractorController.pausePartner);
router.get('/public-profile', ...storeWrite, contractorController.getPublicProfile);
router.patch('/public-profile', ...storeWrite, validate(publicProfileSchema), contractorController.updatePublicProfile);

router.get('/profile', ...contractorOnly, contractorController.getProfile);
router.patch('/profile', ...contractorOnly, validate(profileSchema), contractorController.updateProfile);
router.post(
  '/portfolio',
  ...contractorOnly,
  storeUpload.single('file'),
  validate(portfolioSlotSchema),
  contractorController.uploadPortfolio
);
router.delete('/portfolio', ...contractorOnly, validate(portfolioRemoveSchema), contractorController.removePortfolio);
router.post('/portfolio/projects', ...contractorOnly, contractorController.createPortfolioProject);
router.patch(
  '/portfolio/projects/:projectId',
  ...contractorOnly,
  validate(portfolioProjectSchema),
  contractorController.updatePortfolioProject
);
router.delete('/portfolio/projects/:projectId', ...contractorOnly, contractorController.deletePortfolioProject);
router.post(
  '/portfolio/projects/:projectId/images',
  ...contractorOnly,
  storeUpload.single('file'),
  contractorController.uploadProjectImage
);
router.delete(
  '/portfolio/projects/:projectId/images',
  ...contractorOnly,
  validate(projectImageRemoveSchema),
  contractorController.removeProjectImage
);
router.post(
  '/verification/documents',
  ...contractorOnly,
  verificationUpload.single('file'),
  validate(documentTypeSchema),
  contractorController.uploadDocument
);
router.get(
  '/verification/documents/:documentId/file',
  ...contractorOnly,
  contractorController.serveDocument
);
router.delete('/verification/documents/:documentId', ...contractorOnly, contractorController.removeDocument);
router.post('/verification/submit', ...contractorOnly, validate(submitSchema), contractorController.submitVerification);
router.post(
  '/verification/change-request',
  ...storeWrite,
  validate(verificationChangeSchema),
  contractorController.requestVerificationChange
);
router.get('/location-change/eligibility', ...contractorOnly, locationChangeController.getEligibility);
router.get('/location-change/requests', ...contractorOnly, locationChangeController.listMyRequests);
router.post(
  '/location-change/requests',
  ...contractorOnly,
  validate(locationChangeRequestSchema),
  locationChangeController.createRequest
);

router.get('/ekyc', ...contractorOnly, contractorEkycController.current);
router.post(
  '/ekyc/documents',
  ...contractorOnly,
  ekycMemoryUpload.single('file'),
  contractorEkycController.saveDocument
);
router.post(
  '/ekyc/face/readiness',
  ...contractorOnly,
  ekycMemoryUpload.single('selfie_image'),
  contractorEkycController.readiness
);
router.post(
  '/ekyc/face/validate-frame',
  ...contractorOnly,
  ekycMemoryUpload.fields([
    { name: 'frame_image', maxCount: 1 },
    { name: 'reference_image', maxCount: 1 },
    { name: 'opposite_image', maxCount: 1 },
  ]),
  contractorEkycController.validateFrame
);
router.post(
  '/ekyc/process',
  ...contractorOnly,
  ekycMemoryUpload.fields([
    { name: 'selfie_image', maxCount: 1 },
    { name: 'left_image', maxCount: 1 },
    { name: 'right_image', maxCount: 1 },
    { name: 'up_image', maxCount: 1 },
    { name: 'down_image', maxCount: 1 },
  ]),
  contractorEkycController.processVerification
);
router.post('/ekyc/submit', ...contractorOnly, contractorEkycController.submit);
router.get('/ekyc/files/:kind', ...contractorOnly, contractorEkycController.file);

router.get('/store', ...storeWrite, loadStore, storeController.getStore);
router.post('/store', ...storeWrite, validate(storeSchema), storeController.createStore);
router.patch('/store', ...storeWrite, validate(storeSchema.partial()), storeController.updateStore);
router.delete('/store', ...storeWrite, storeController.deleteStore);

router.get('/service-catalog/check', ...contractorOnly, validate(catalogCheckSchema, 'query'), contractorController.checkServiceCatalog);
router.get('/service-catalog', ...contractorOnly, contractorController.listServiceCatalog);
router.post('/service-catalog/custom', ...contractorOnly, validate(catalogCreateSchema), contractorController.createCustomService);

router.get('/services', ...catalogWrite, serviceController.list);
router.post('/services/register', ...catalogWrite, validate(registerServiceSchema), serviceController.register);
router.patch('/services/:id', ...catalogWrite, validate(offeringUpdateSchema), serviceController.update);
router.delete('/services/:id', ...catalogWrite, serviceController.remove);

module.exports = router;
