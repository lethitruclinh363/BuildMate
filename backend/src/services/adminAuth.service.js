const { ROLES, USER_STATUS } = require('../models/user.model');
const { userRepository } = require('../repositories/user.repository');
const { ApiError } = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

/**
 * Login riêng cho Admin Portal — không dùng chung flow user.
 * Chỉ role ADMIN được cấp token.
 */
async function login({ email, password }) {
  const user = await userRepository.findByEmailWithPassword(email);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.role !== ROLES.ADMIN) {
    throw new ApiError(403, 'Forbidden');
  }

  if (user.status === USER_STATUS.BANNED || user.status === USER_STATUS.BLOCKED) {
    throw new ApiError(403, 'This account has been suspended');
  }

  const token = signToken(user);
  return { token, user: user.toPublic() };
}

async function me(userId) {
  const user = await userRepository.findById(userId);
  if (!user || user.role !== ROLES.ADMIN) {
    throw new ApiError(403, 'Forbidden');
  }
  return user.toPublic();
}

async function logout(userId) {
  await userRepository.incrementTokenVersion(userId);
  return { loggedOut: true };
}

module.exports = { login, me, logout };
