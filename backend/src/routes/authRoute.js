const express = require('express');
const { validate } = require('../utils/validator');
const {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  verifyEmailSchema,
  resendCodeSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-code', validate(resendCodeSchema), authController.resendCode);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/verify-reset-code', validate(verifyResetCodeSchema), authController.verifyResetCode);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
router.post('/login', validate(loginSchema), authController.login);
router.post('/google', validate(googleLoginSchema), authController.googleLogin);
router.post('/logout', authenticate, authController.logout);

module.exports = router;
