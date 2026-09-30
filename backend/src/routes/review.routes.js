const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { reviewSchema, reviewReplySchema, reviewReportSchema } = require('../validators/finance.validator');
const reviewController = require('../controllers/review.controller');

const router = express.Router();

router.get('/user/:id', reviewController.listForUser);
router.post('/', authenticate, authorize(ROLES.CUSTOMER), validate(reviewSchema), reviewController.create);
router.post('/:id/reply', authenticate, authorize(ROLES.CONTRACTOR), validate(reviewReplySchema), reviewController.reply);
router.post('/:id/report', authenticate, authorize(ROLES.CONTRACTOR), validate(reviewReportSchema), reviewController.report);

module.exports = router;
