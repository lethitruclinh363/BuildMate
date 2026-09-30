const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const adminAuthService = require('../services/adminAuth.service');

const login = asyncHandler(async (req, res) => {
  const data = await adminAuthService.login(req.body);
  return success(res, data, 'Admin login successful');
});

const me = asyncHandler(async (req, res) => {
  const data = await adminAuthService.me(req.user.id);
  return success(res, data, 'Admin profile retrieved');
});

const logout = asyncHandler(async (_req, res) => {
  const data = adminAuthService.logout();
  return success(res, data, 'Logged out successfully');
});

module.exports = { login, me, logout };
