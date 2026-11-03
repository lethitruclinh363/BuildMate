const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { ROLES, USER_STATUS } = require('../models/user.model');
const { userRepository } = require('../repositories/userRepository');
const policyService = require('./policy.service');
const profileStatusService = require('./profileStatusService');
const accountIdentity = require('./accountIdentity');
const { normalizeEmail } = require('../utils/identity');
const { ApiError } = require('../utils/ApiError');
const jwt = require('../utils/jwt');
const { env } = require('../config/env');

const googleClient = new OAuth2Client();

function googleError(statusCode, message, code) {
  return new ApiError(statusCode, message, { code });
}

function timingSafeEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyCredential(credential, nonce) {
  if (!env.googleClientId) {
    throw googleError(503, 'Google sign-in is not configured', 'GOOGLE_NOT_CONFIGURED');
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    if (error?.code || error?.response || Number(error?.status) >= 500) {
      throw googleError(503, 'Google credential verification is temporarily unavailable', 'GOOGLE_VERIFICATION_UNAVAILABLE');
    }
    throw googleError(401, 'Google credential is invalid or expired', 'GOOGLE_CREDENTIAL_INVALID');
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true || !timingSafeEqual(payload.nonce, nonce)) {
    throw googleError(401, 'Google credential is invalid or expired', 'GOOGLE_CREDENTIAL_INVALID');
  }

  const email = normalizeEmail(payload.email);
  const isGmail = email.endsWith('@gmail.com');
  const isWorkspace = Boolean(payload.hd) && email.endsWith(`@${String(payload.hd).toLowerCase()}`);
  if (!isGmail && !isWorkspace) {
    throw googleError(403, 'Use a verified Gmail or Google Workspace account', 'GOOGLE_EMAIL_UNSUPPORTED');
  }

  return {
    email,
    name: String(payload.name || '').trim().slice(0, 80) || email.split('@')[0],
    avatar: String(payload.picture || ''),
  };
}

async function createSession(user) {
  await profileStatusService.syncUserProfileStatus(user);
  return {
    requiresRegistration: false,
    token: jwt.signToken(user),
    user: user.toPublic(),
  };
}

async function existingCustomerSession(user) {
  if (user.role !== ROLES.CUSTOMER) {
    throw googleError(403, 'Google sign-in is available for customer accounts only', 'GOOGLE_CUSTOMER_ONLY');
  }

  if (
    user.status === USER_STATUS.BANNED ||
    user.status === USER_STATUS.BLOCKED ||
    user.status === USER_STATUS.REJECTED
  ) {
    throw new ApiError(403, 'This account has been suspended');
  }
  if (user.status === USER_STATUS.INACTIVE) {
    throw new ApiError(403, 'This account is inactive');
  }

  if (!user.emailVerified || user.status === USER_STATUS.PENDING_EMAIL) {
    user.emailVerified = true;
    user.status = USER_STATUS.ACTIVE;
    await user.save();
  }

  return createSession(user);
}

async function login({ credential, nonce, phoneNumber, acceptedPolicy, policyLanguage }) {
  const identity = await verifyCredential(credential, nonce);
  const existingUser = await userRepository.findByEmail(identity.email);
  if (existingUser) return existingCustomerSession(existingUser);

  if (!phoneNumber || acceptedPolicy !== true) {
    return {
      requiresRegistration: true,
      email: identity.email,
      name: identity.name,
      avatar: identity.avatar,
    };
  }

  const availableIdentity = await accountIdentity.assertAccountIdentityAvailable({
    email: identity.email,
    phone: phoneNumber,
  });
  const { acceptanceVersion } = await policyService.acceptanceForLanguage(policyLanguage || 'vi');

  let user;
  try {
    user = await userRepository.create({
      name: identity.name,
      fullName: identity.name,
      email: availableIdentity.email,
      phone: availableIdentity.phone,
      phoneNumber: availableIdentity.phone,
      password: crypto.randomBytes(32).toString('base64url'),
      avatar: identity.avatar,
      acceptedPolicy: true,
      acceptedPolicyVersion: acceptanceVersion,
      acceptedPolicyAt: new Date(),
      profileStatus: 'APPROVED',
      role: ROLES.CUSTOMER,
      status: USER_STATUS.ACTIVE,
      emailVerified: true,
      preferredLanguage: policyLanguage || 'vi',
    });
  } catch (error) {
    accountIdentity.throwIfIdentityUniqueConflict(error);
  }

  return createSession(user);
}

module.exports = { login, verifyCredential };
