const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { repairUpload } = require('../middleware/upload.middleware');
const { validate } = require('../utils/validator');
const { createRepairSchema } = require('../validators/sprint4.validator');
const repairController = require('../controllers/repair.controller');

const router = require('express').Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.CUSTOMER),
  repairUpload.fields([
    { name: 'images', maxCount: 8 },
    { name: 'videos', maxCount: 2 },
  ]),
  validate(createRepairSchema),
  repairController.create
);

router.get('/my', authenticate, authorize(ROLES.CUSTOMER), repairController.mine);
router.get('/received', authenticate, authorize(ROLES.CONTRACTOR), repairController.received);
router.get('/:id', authenticate, repairController.getOne);
router.patch('/:id/accept', authenticate, authorize(ROLES.CONTRACTOR), repairController.accept);
router.patch('/:id/reject', authenticate, authorize(ROLES.CONTRACTOR), repairController.reject);

module.exports = router;
