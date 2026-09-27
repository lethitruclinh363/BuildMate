const { asyncHandler } = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { ApiError } = require('../utils/ApiError');
const userService = require('../services/user.service');
const { publicFileUrl } = require('../middleware/upload.middleware');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return success(res, profile, 'Profile retrieved');
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await userService.updateProfile(req.user.id, req.body, req.user);
  return success(res, profile, 'Profile updated');
});

const changePassword = asyncHandler(async (req, res) => {
  const data = await userService.changePassword(req.user.id, req.body, req.user);
  return success(res, data, 'Password updated');
});

const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Avatar file is required');
  const profile = await userService.updateAvatar(req.user.id, publicFileUrl(req.file.path), req.user);
  return success(res, profile, 'Avatar updated');
});

module.exports = { getProfile, updateProfile, changePassword, updateAvatar };
