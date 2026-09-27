const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { reviewSchema } = require('../validators/finance.validator');
const reviewController = require('../controllers/review.controller');

const router = express.Router();

router.get('/user/:id', reviewController.listForUser);
router.post('/', authenticate, authorize(ROLES.CUSTOMER), validate(reviewSchema), reviewController.create);

module.exports = router;
