const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Payload bắt buộc: { id, role, tokenVersion }.
 * Sign + verify cố định HS256 (không nhận alg "none").
 */
function signToken(user) {
  const id = user._id ? user._id.toString() : String(user.id);
  if (!id || !user.role) {
    throw new Error('JWT requires user id and role');
  }

  return jwt.sign(
    { id, role: user.role, tokenVersion: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

function getUserId(payload) {
  return payload.id || payload.sub || null;
}

module.exports = { signToken, verifyToken, getUserId };
