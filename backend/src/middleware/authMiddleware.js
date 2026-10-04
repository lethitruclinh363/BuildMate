const { USER_STATUS } = require('../models/user.model');
const { userRepository } = require('../repositories/userRepository');
const { ApiError } = require('../utils/ApiError');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyToken, getUserId } = require('../utils/jwt');

/**
 * Đọc Bearer token → verify JWT → gắn req.user { id, role, status }.
 * Role luôn có mặt; token thiếu role bị từ chối.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }

  if (!payload.role) {
    throw new ApiError(401, 'Invalid token payload');
  }

  const tokenVersion = payload.tokenVersion === undefined ? 0 : payload.tokenVersion;
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw new ApiError(401, 'Invalid token payload');
  }

  const userId = getUserId(payload);
  if (!userId) {
    throw new ApiError(401, 'Invalid token payload');
  }

  const user = await userRepository.findByIdForAuth(userId);
  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }

  if (tokenVersion !== (user.tokenVersion || 0)) {
    throw new ApiError(401, 'Session expired. Please log in again');
  }

  if (user.status === USER_STATUS.BANNED || user.status === USER_STATUS.BLOCKED) {
    throw new ApiError(403, 'This account has been suspended');
  }

  // Role lấy từ DB, không tin role trong JWT (tránh token cũ sau khi đổi role).
  req.user = {
    id: user._id.toString(),
    role: user.role,
    status: user.status,
  };
  next();
});

module.exports = { authenticate };
