const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { checkoutQuoteSchema } = require('../validators/material-checkout.validator');
const controller = require('../controllers/material-checkout.controller');

const router = express.Router();

router.post('/quote', authenticate, authorize(ROLES.CUSTOMER), validate(checkoutQuoteSchema), controller.quote);

module.exports = router;
