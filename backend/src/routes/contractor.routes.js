const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const {
  loadContractorProfile,
  requireApprovedContractor,
  loadStore,
  requireStore,
} = require('../middleware/contractor.middleware');
const { verificationUpload } = require('../middleware/upload.middleware');
const { validate } = require('../utils/validator');
const {
  profileSchema,
  documentTypeSchema,
  storeSchema,
  serviceSchema,
} = require('../validators/partner.validator');
const contractorController = require('../controllers/contractor.controller');
const storeController = require('../controllers/store.controller');
const serviceController = require('../controllers/service.controller');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();
const contractorOnly = [authenticate, authorize(ROLES.CONTRACTOR), loadContractorProfile];
const storeWrite = [...contractorOnly, requireApprovedContractor];
const catalogWrite = [...storeWrite, requireStore];

router.get('/earnings', authenticate, authorize(ROLES.CONTRACTOR), paymentController.earnings);

router.get('/dashboard-stats', ...contractorOnly, contractorController.getDashboardStats);
router.get('/workspace', ...contractorOnly, contractorController.getWorkspace);
router.get('/profile', ...contractorOnly, contractorController.getProfile);
router.patch('/profile', ...contractorOnly, validate(profileSchema), contractorController.updateProfile);
router.post(
  '/verification/documents',
  ...contractorOnly,
  verificationUpload.single('file'),
  validate(documentTypeSchema),
  contractorController.uploadDocument
);
router.delete('/verification/documents/:documentId', ...contractorOnly, contractorController.removeDocument);
router.post('/verification/submit', ...contractorOnly, contractorController.submitVerification);

router.get('/store', ...storeWrite, loadStore, storeController.getStore);
router.post('/store', ...storeWrite, validate(storeSchema), storeController.createStore);
router.patch('/store', ...storeWrite, validate(storeSchema.partial()), storeController.updateStore);
router.delete('/store', ...storeWrite, storeController.deleteStore);

router.get('/services', ...catalogWrite, serviceController.list);
router.post('/services', ...catalogWrite, validate(serviceSchema), serviceController.create);
router.patch('/services/:id', ...catalogWrite, validate(serviceSchema.partial()), serviceController.update);
router.delete('/services/:id', ...catalogWrite, serviceController.remove);

module.exports = router;
