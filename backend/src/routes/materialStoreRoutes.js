const express = require('express');
const { ROLES } = require('../models/User');
const { Store, STORE_TYPE } = require('../models/Store');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const { storeSchema, materialSchema, profileSchema, documentTypeSchema, submitSchema } = require('../validators/partner.validator');
const { verificationUpload } = require('../middleware/uploadMiddleware');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ApiError } = require('../utils/ApiError');
const { asyncHandler } = require('../utils/asyncHandler');
const storeController = require('../controllers/storeController');
const materialController = require('../controllers/materialController');
const contractorController = require('../controllers/contractorController');

const router = express.Router();

const owner = [authenticate, authorize(ROLES.MATERIAL_STORE_OWNER)];

const loadStore = asyncHandler(async (req, _res, next) => {
  req.store = await Store.findOne({ contractorId: req.user.id });
  next();
});

const requireMaterialStore = asyncHandler(async (req, _res, next) => {
  const store = req.store || (await Store.findOne({ contractorId: req.user.id }));
  if (!store) {
    throw new ApiError(400, 'Create your material store before adding materials');
  }
  if (store.storeType !== STORE_TYPE.MATERIALS) {
    throw new ApiError(403, 'Only a material store can manage materials');
  }
  req.store = store;
  next();
});

const requireApprovedOwner = asyncHandler(async (req, _res, next) => {
  const profile = await ContractorProfile.findOne({ userId: req.user.id });
  if (profile?.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw new ApiError(403, 'Material store must be approved before publishing products');
  }
  next();
});

router.get('/workspace', ...owner, contractorController.getMaterialWorkspace);
router.get('/profile', ...owner, contractorController.getProfile);
router.patch('/profile', ...owner, validate(profileSchema), contractorController.updateProfile);
router.post(
  '/verification/documents',
  ...owner,
  verificationUpload.single('file'),
  validate(documentTypeSchema),
  contractorController.uploadDocument
);
router.delete('/verification/documents/:documentId', ...owner, contractorController.removeDocument);
router.post('/verification/submit', ...owner, validate(submitSchema), contractorController.submitVerification);

router.get('/store', ...owner, storeController.getStore);
router.post('/store', ...owner, validate(storeSchema), storeController.createStore);
router.patch('/store', ...owner, validate(storeSchema.partial()), storeController.updateStore);

router.get('/materials', ...owner, loadStore, requireMaterialStore, materialController.list);
router.post(
  '/materials',
  ...owner,
  requireApprovedOwner,
  loadStore,
  requireMaterialStore,
  validate(materialSchema),
  materialController.create
);
router.patch(
  '/materials/:id',
  ...owner,
  requireApprovedOwner,
  loadStore,
  requireMaterialStore,
  validate(materialSchema.partial()),
  materialController.update
);
router.delete('/materials/:id', ...owner, requireApprovedOwner, loadStore, requireMaterialStore, materialController.remove);

module.exports = router;
