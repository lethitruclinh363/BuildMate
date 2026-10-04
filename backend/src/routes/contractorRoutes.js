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
const { verificationUpload } = require('../middleware/uploadMiddleware');
const { validate } = require('../utils/validator');
const {
  profileSchema,
  publicProfileSchema,
  verificationChangeSchema,
  documentTypeSchema,
  portfolioSlotSchema,
  portfolioRemoveSchema,
  submitSchema,
  storeSchema,
  registerServiceSchema,
  offeringUpdateSchema,
  catalogCheckSchema,
  catalogCreateSchema,
} = require('../validators/partner.validator');
const contractorController = require('../controllers/contractorController');
const storeController = require('../controllers/storeController');
const serviceController = require('../controllers/serviceController');
const paymentController = require('../controllers/paymentController');

const router = express.Router();
const contractorOnly = [authenticate, authorize(ROLES.CONTRACTOR), loadContractorProfile];
const storeWrite = [...contractorOnly, requireApprovedContractor];
const catalogWrite = [...storeWrite, requireStore];

router.get('/earnings', authenticate, authorize(ROLES.CONTRACTOR), paymentController.earnings);

router.get('/dashboard-stats', ...contractorOnly, contractorController.getDashboardStats);
router.get('/reputation', ...contractorOnly, contractorController.getReputation);
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
  verificationUpload.single('file'),
  validate(portfolioSlotSchema),
  contractorController.uploadPortfolio
);
router.delete('/portfolio', ...contractorOnly, validate(portfolioRemoveSchema), contractorController.removePortfolio);
router.post(
  '/verification/documents',
  ...contractorOnly,
  verificationUpload.single('file'),
  validate(documentTypeSchema),
  contractorController.uploadDocument
);
router.delete('/verification/documents/:documentId', ...contractorOnly, contractorController.removeDocument);
router.post('/verification/submit', ...contractorOnly, validate(submitSchema), contractorController.submitVerification);
router.post(
  '/verification/change-request',
  ...storeWrite,
  validate(verificationChangeSchema),
  contractorController.requestVerificationChange
);

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
