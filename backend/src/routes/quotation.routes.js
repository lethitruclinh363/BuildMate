const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { createQuotationSchema, modifyQuotationSchema } = require('../validators/sprint4.validator');
const quotationController = require('../controllers/quotation.controller');

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
