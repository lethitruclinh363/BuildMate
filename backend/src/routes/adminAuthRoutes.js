const express = require('express');
const { validate } = require('../utils/validator');
const { loginSchema } = require('../validators/auth.validator');
const { authenticate } = require('../middleware/authMiddleware');
const { allowRole } = require('../middleware/roleMiddleware');
const adminAuthController = require('../controllers/adminAuthController');

const router = express.Router();

router.post('/login', validate(loginSchema), adminAuthController.login);
router.get('/me', authenticate, allowRole('ADMIN'), adminAuthController.me);
router.post('/logout', authenticate, allowRole('ADMIN'), adminAuthController.logout);

module.exports = router;
