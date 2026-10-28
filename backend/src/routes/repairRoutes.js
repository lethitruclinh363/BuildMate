const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { repairUpload } = require('../middleware/uploadMiddleware');
const { validate } = require('../utils/validator');
const { createRepairSchema } = require('../validators/sprint4.validator');
const repairController = require('../controllers/repairController');

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
router.patch('/:id/cancel', authenticate, authorize(ROLES.CUSTOMER), repairController.cancel);

module.exports = router;
