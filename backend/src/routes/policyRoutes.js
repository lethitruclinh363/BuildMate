const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRole } = require('../middleware/roleMiddleware');
const { validate } = require('../utils/validator');
const { createPolicySchema, updatePolicySchema, activeQuerySchema } = require('../validators/policy.validator');
const policyController = require('../controllers/policyController');

const router = express.Router();
const adminOnly = [authenticate, allowRole('ADMIN')];

router.get('/active', validate(activeQuerySchema, 'query'), policyController.active);

router.get('/', ...adminOnly, policyController.list);
router.post('/', ...adminOnly, validate(createPolicySchema), policyController.create);
router.get('/:id/history', ...adminOnly, policyController.history);
router.get('/:id', ...adminOnly, policyController.getOne);
router.patch('/:id', ...adminOnly, validate(updatePolicySchema), policyController.update);

module.exports = router;
