const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { checkoutSchema } = require('../validators/finance.validator');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

router.get('/order/:orderId', authenticate, paymentController.listForOrder);
router.post(
  '/:id/checkout',
  authenticate,
  authorize(ROLES.CUSTOMER),
  validate(checkoutSchema),
  paymentController.checkout
);
router.post('/:id/mock-success', authenticate, authorize(ROLES.CUSTOMER), paymentController.mockSuccess);

module.exports = router;
