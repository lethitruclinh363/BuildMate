const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const { checkoutQuoteSchema } = require('../validators/material-checkout.validator');
const controller = require('../controllers/material-checkout.controller');

const router = express.Router();

router.post('/quote', authenticate, authorize(ROLES.CUSTOMER), validate(checkoutQuoteSchema), controller.quote);

module.exports = router;
