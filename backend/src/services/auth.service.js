const crypto = require('crypto');
const { ROLES, USER_STATUS } = require('../models/user.model');
const { userRepository } = require('../repositories/user.repository');
const {
  sendVerificationEmail,
  sendResetPasswordEmail,
  isSmtpConfigured,
} = require('../providers/email.provider');
const { acceptanceForLanguage } = require('./policy.service');
const { syncUserProfileStatus } = require('./profileStatus.service');
const { ApiError } = require('../utils/ApiError');
const { signToken } = require('../utils/jwt');

const PUBLIC_ROLES = [
  ROLES.CUSTOMER,
  ROLES.CONTRACTOR,
  ROLES.MATERIAL_STORE_OWNER,
];

const OTP_TTL_MS = 5 * 60 * 1000;

function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function otpExpiry() {
  return new Date(Date.now() + OTP_TTL_MS);
}

/** So sánh OTP cùng độ dài — tránh lệch thời gian khi đoán mã. */
function codesMatch(input, stored) {
  const a = String(input || '').trim();
  const b = String(stored || '').trim();
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function issueAndSendOtp(user) {
  const otp = generateOtp();
  user.verificationCode = otp;
  user.verificationExpire = otpExpiry();
  await userRepository.save(user);

  try {
    const result = await sendVerificationEmail({
      to: user.email,
      name: user.fullName || user.name,
      otp,
    });
    return { emailSent: Boolean(result.sent) };
  } catch (err) {
    console.error('[email] verification send failed:', err.message);
    if (isSmtpConfigured()) {
      throw new ApiError(503, 'Could not send verification email. Please try resend-code.');
    }
    return { emailSent: false };
  }
}

async function register({ name, fullName, email, password, phoneNumber, role, acceptedPolicy, policyLanguage }) {
  const displayName = fullName || name;
  const normalizedPhone = String(phoneNumber || '').trim();

  if (!PUBLIC_ROLES.includes(role)) {
    throw new ApiError(400, 'Invalid role for self-registration');
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new ApiError(409, 'Email already exists');
  }

  const existingPhone = await userRepository.findByPhone(normalizedPhone);
  if (existingPhone) {
    throw new ApiError(409, 'Phone number already exists');
  }

  if (acceptedPolicy !== true) {
    throw new ApiError(400, 'You must accept the terms and privacy policy');
  }

  const { acceptanceVersion } = await acceptanceForLanguage(policyLanguage || 'vi');

  // Password để plaintext — User model pre-save hash bcrypt (12).
  const user = await userRepository.create({
    name: displayName,
    fullName: displayName,
    email,
    password,
    phone: normalizedPhone,
    phoneNumber: normalizedPhone,
    acceptedPolicy: true,
    acceptedPolicyVersion: acceptanceVersion,
    acceptedPolicyAt: new Date(),
    profileStatus: role === ROLES.CUSTOMER ? 'APPROVED' : 'INCOMPLETE',
    role,
    status: USER_STATUS.PENDING_EMAIL,
    emailVerified: false,
  });

  const { emailSent } = await issueAndSendOtp(user);

  return {
    message: emailSent
      ? 'Please verify your email'
      : 'Please verify your email. SMTP is not configured — check the backend console for the OTP.',
    emailSent,
  };
}

async function verifyEmail({ email, code }) {
  const user = await userRepository.findByEmailForVerify(email);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  if (user.emailVerified && user.status === USER_STATUS.ACTIVE) {
    throw new ApiError(400, 'Email is already verified');
  }

  if (!user.verificationCode) {
    throw new ApiError(400, 'No verification code. Please request a new one');
  }

  if (!user.verificationExpire || user.verificationExpire.getTime() < Date.now()) {
    throw new ApiError(400, 'Verification code has expired');
  }

  if (!codesMatch(code, user.verificationCode)) {
    throw new ApiError(400, 'Invalid verification code');
  }

  user.emailVerified = true;
  user.status = USER_STATUS.ACTIVE;
  user.verificationCode = '';
  user.verificationExpire = null;
  await userRepository.save(user);

  return { message: 'Email verified successfully' };
}

async function resendCode({ email }) {
  const user = await userRepository.findByEmailForVerify(email);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  if (user.emailVerified) {
    throw new ApiError(400, 'Email is already verified');
  }

  const { emailSent } = await issueAndSendOtp(user);

  return {
    message: emailSent
      ? 'A new verification code has been sent'
      : 'A new verification code was created. SMTP is not configured — check the backend console.',
    emailSent,
  };
}

async function login({ email, password }) {
  const user = await userRepository.findByEmailWithPassword(email);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.role === ROLES.ADMIN || !PUBLIC_ROLES.includes(user.role)) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!user.emailVerified || user.status === USER_STATUS.PENDING_EMAIL) {
    throw new ApiError(403, 'Please verify your email');
  }

  if (user.status === USER_STATUS.BANNED || user.status === USER_STATUS.BLOCKED) {
    throw new ApiError(403, 'This account has been suspended');
  }

  if (user.status === USER_STATUS.REJECTED) {
    throw new ApiError(403, 'This account has been rejected');
  }

  if (user.status === USER_STATUS.INACTIVE) {
    throw new ApiError(403, 'This account is inactive');
  }

  if (!user.role) {
    throw new ApiError(403, 'Account is missing a role');
  }

  await syncUserProfileStatus(user);
  const token = signToken(user);
  return { token, user: user.toPublic() };
}

function logout() {
  return { loggedOut: true };
}

function assertResetOtp(user, code) {
  if (!user.resetPasswordToken) {
    throw new ApiError(400, 'No reset code. Please request a new one');
  }

  if (!user.resetPasswordExpire || user.resetPasswordExpire.getTime() < Date.now()) {
    throw new ApiError(400, 'Reset code has expired');
  }

  if (!codesMatch(code, user.resetPasswordToken)) {
    throw new ApiError(400, 'Invalid reset code');
  }
}

async function forgotPassword({ email }) {
  const generic = { message: 'A reset code has been sent to your email' };
  const user = await userRepository.findByEmailForReset(email);
  if (!user) {
    return { ...generic, emailSent: true };
  }

  const otp = generateOtp();
  user.resetPasswordToken = otp;
  user.resetPasswordExpire = otpExpiry();
  await userRepository.save(user);

  try {
    const result = await sendResetPasswordEmail({
      to: user.email,
      name: user.fullName || user.name,
      otp,
    });
    if (result.skipped) {
      return {
        message: 'A reset code has been created. SMTP is not configured — check the backend console.',
        emailSent: false,
      };
    }
    return { ...generic, emailSent: true };
  } catch (err) {
    console.error('[email] reset send failed:', err.message);
    if (isSmtpConfigured()) {
      throw new ApiError(503, 'Could not send reset email. Please try again.');
    }
    return { ...generic, emailSent: false };
  }
}

async function verifyResetCode({ email, code }) {
  const user = await userRepository.findByEmailForReset(email);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  assertResetOtp(user, code);

  return { message: 'Reset code is valid' };
}

async function resetPassword({ email, code, newPassword }) {
  const user = await userRepository.findByEmailForReset(email);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  assertResetOtp(user, code);

  // Plaintext — pre-save hook hash bcrypt.
  user.password = newPassword;
  user.resetPasswordToken = '';
  user.resetPasswordExpire = null;
  await userRepository.save(user);

  return { message: 'Password has been reset' };
}

module.exports = {
  register,
  verifyEmail,
  resendCode,
  login,
  logout,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  signToken,
};
