const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const authService = require('../services/authService');
const googleAuthService = require('../services/googleAuthService');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, { emailSent: result.emailSent }, result.message);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.body);
  return success(res, null, result.message);
});

const resendCode = asyncHandler(async (req, res) => {
  const result = await authService.resendCode(req.body);
  return success(res, { emailSent: result.emailSent }, result.message);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return success(res, result, 'Login successful');
});

const googleLogin = asyncHandler(async (req, res) => {
  const result = await googleAuthService.login(req.body);
  return success(res, result, result.requiresRegistration ? 'Complete customer registration' : 'Google login successful');
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user.id);
  return success(res, result, 'Logged out successfully');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return success(res, { emailSent: result.emailSent }, result.message);
});

const verifyResetCode = asyncHandler(async (req, res) => {
  const result = await authService.verifyResetCode(req.body);
  return success(res, null, result.message);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  return success(res, null, result.message);
});

module.exports = {
  register,
  verifyEmail,
  resendCode,
  login,
  googleLogin,
  logout,
  forgotPassword,
  verifyResetCode,
  resetPassword,
};
