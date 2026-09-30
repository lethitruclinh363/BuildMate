const express = require('express');
const { validate } = require('../utils/validator');
const { loginSchema } = require('../validators/auth.validator');
const { authenticate } = require('../middleware/auth.middleware');
const { allowRole } = require('../middleware/role.middleware');
const adminAuthController = require('../controllers/adminAuth.controller');

const router = express.Router();

router.post('/login', validate(loginSchema), adminAuthController.login);
router.get('/me', authenticate, allowRole('ADMIN'), adminAuthController.me);
router.post('/logout', authenticate, allowRole('ADMIN'), adminAuthController.logout);

module.exports = router;
