const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { createMaterialOrderSchema, depositCheckoutSchema, settleRemainingSchema } = require('../validators/material-order.validator');
const controller = require('../controllers/material-order.controller');

const router = express.Router();

router.use(authenticate, authorize(ROLES.CUSTOMER));

router.post('/', validate(createMaterialOrderSchema), controller.createOrder);
router.get('/my', controller.listMine);
router.post('/:id/deposit/checkout', validate(depositCheckoutSchema), controller.checkoutDeposit);
router.post('/:id/deposit/mock-success', controller.captureDeposit);
router.post('/:id/cancel', controller.cancelMine);
router.post('/:id/receive', controller.receiveMine);
router.post('/:id/remaining-settled', validate(settleRemainingSchema), controller.settleRemaining);
router.get('/:id', controller.getMine);

module.exports = router;
