const { userRepository } = require('../repositories/userRepository');
const { ApiError } = require('../utils/ApiError');
const {
  EMAIL_ALREADY_EXISTS,
  PHONE_ALREADY_EXISTS,
  ACCOUNT_IDENTITY_CONFLICT,
  EMAIL_MESSAGE,
  PHONE_MESSAGE,
  BOTH_MESSAGE,
  normalizeEmail,
  normalizeVnMobile,
  isValidVnMobile,
  identityFieldsFromPrisma,
  isPrismaUniqueConflict,
  isUsersIdentityUniqueConflict,
} = require('../utils/identity');

function sameUser(found, excludeUserId) {
  if (!found || !excludeUserId) return false;
  return String(found._id || found.id) === String(excludeUserId);
}

function identityError(emailTaken, phoneTaken) {
  if (emailTaken && phoneTaken) {
    return new ApiError(409, BOTH_MESSAGE, {
      code: ACCOUNT_IDENTITY_CONFLICT,
      field: ['email', 'phone'],
      conflicts: [
        { code: EMAIL_ALREADY_EXISTS, field: 'email', message: EMAIL_MESSAGE },
        { code: PHONE_ALREADY_EXISTS, field: 'phone', message: PHONE_MESSAGE },
      ],
    });
  }
  if (emailTaken) {
    return new ApiError(409, EMAIL_MESSAGE, { code: EMAIL_ALREADY_EXISTS, field: 'email' });
  }
  if (phoneTaken) {
    return new ApiError(409, PHONE_MESSAGE, { code: PHONE_ALREADY_EXISTS, field: 'phone' });
  }
  return null;
}

async function assertAccountIdentityAvailable({ email, phone, excludeUserId } = {}) {
  const normalizedEmail = email == null || email === '' ? '' : normalizeEmail(email);
  const normalizedPhone = phone == null || phone === '' ? '' : normalizeVnMobile(phone);

  if (phone && normalizedPhone && !isValidVnMobile(normalizedPhone)) {
    throw new ApiError(400, 'Invalid phone number', { field: 'phone' });
  }

  const [emailOwner, phoneOwner] = await Promise.all([
    normalizedEmail ? userRepository.findByEmail(normalizedEmail) : null,
    normalizedPhone ? userRepository.findByPhone(normalizedPhone) : null,
  ]);

  const emailTaken = Boolean(emailOwner) && !sameUser(emailOwner, excludeUserId);
  const phoneTaken = Boolean(phoneOwner) && !sameUser(phoneOwner, excludeUserId);
  const error = identityError(emailTaken, phoneTaken);
  if (error) throw error;

  return { email: normalizedEmail, phone: normalizedPhone };
}

function conflictFromUniqueError(err) {
  if (!isPrismaUniqueConflict(err) && Number(err?.code) !== 11000) return null;
  const fields = identityFieldsFromPrisma(err);
  const key = Object.keys(err.keyPattern || err.keyValue || {})[0];
  const email = fields.email || key === 'email';
  const phone = fields.phone || key === 'phone' || key === 'phoneNumber' || key === 'phone_number';
  const mapped = identityError(email, phone);
  if (mapped) return mapped;
  if (isUsersIdentityUniqueConflict(err)) {
    return new ApiError(409, EMAIL_MESSAGE, { code: ACCOUNT_IDENTITY_CONFLICT, field: ['email', 'phone'] });
  }
  return null;
}

function throwIfIdentityUniqueConflict(err) {
  const mapped = conflictFromUniqueError(err);
  if (mapped) throw mapped;
  throw err;
}

module.exports = {
  assertAccountIdentityAvailable,
  conflictFromUniqueError,
  throwIfIdentityUniqueConflict,
  identityError,
};
