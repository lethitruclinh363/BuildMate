const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { progressUpload } = require('../middleware/uploadMiddleware');
const { validate } = require('../utils/validator');
const { progressSchema } = require('../validators/order.validator');
const progressController = require('../controllers/progressController');

const router = require('express').Router();

router.use(authenticate);
router.get('/:id/progress', progressController.list);
router.post(
  '/:id/progress',
  authorize(ROLES.CONTRACTOR),
  progressUpload.array('images', 6),
  validate(progressSchema),
  progressController.create
);

module.exports = router;
