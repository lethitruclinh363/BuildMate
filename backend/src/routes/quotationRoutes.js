const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const { createQuotationSchema, modifyQuotationSchema } = require('../validators/sprint4.validator');
const quotationController = require('../controllers/quotationController');

const router = require('express').Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.CONTRACTOR),
  validate(createQuotationSchema),
  quotationController.create
);
router.get('/request/:requestId', authenticate, quotationController.listForRequest);
router.get('/:id', authenticate, quotationController.getOne);
router.patch('/:id/accept', authenticate, authorize(ROLES.CUSTOMER), quotationController.accept);
router.patch('/:id/reject', authenticate, authorize(ROLES.CUSTOMER), quotationController.reject);
router.patch(
  '/:id/request-modification',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(modifyQuotationSchema),
  quotationController.requestModification
);

module.exports = router;
