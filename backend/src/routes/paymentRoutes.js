const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const { checkoutSchema } = require('../validators/finance.validator');
const paymentController = require('../controllers/paymentController');

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
