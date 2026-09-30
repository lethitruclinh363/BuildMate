const express = require('express');
const { ROLES } = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../utils/validator');
const { complaintSchema } = require('../validators/finance.validator');
const complaintController = require('../controllers/complaint.controller');

const router = express.Router();
const partyRoles = [authenticate, authorize(ROLES.CUSTOMER, ROLES.CONTRACTOR)];

router.get('/my', authenticate, complaintController.mine);
router.post('/', ...partyRoles, validate(complaintSchema), complaintController.create);

module.exports = router;
