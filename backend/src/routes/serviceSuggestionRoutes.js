const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize, allowRole } = require('../middleware/roleMiddleware');
const { loadContractorProfile } = require('../middleware/contractorMiddleware');
const { validate } = require('../utils/validator');
const { serviceSuggestionSchema, suggestionRejectSchema, catalogWriteSchema } = require('../validators/partner.validator');
const controller = require('../controllers/serviceSuggestionController');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorize(ROLES.CONTRACTOR),
  loadContractorProfile,
  validate(serviceSuggestionSchema),
  controller.create
);

router.get('/', authenticate, allowRole('ADMIN'), controller.list);
router.post('/:id/reject', authenticate, allowRole('ADMIN'), validate(suggestionRejectSchema), controller.reject);
router.post('/:id/convert', authenticate, allowRole('ADMIN'), validate(catalogWriteSchema), controller.convert);

module.exports = router;
