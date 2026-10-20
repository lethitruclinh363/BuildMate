const EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS';
const PHONE_ALREADY_EXISTS = 'PHONE_ALREADY_EXISTS';
const ACCOUNT_IDENTITY_CONFLICT = 'ACCOUNT_IDENTITY_CONFLICT';

const EMAIL_MESSAGE = 'This email is already registered on BuildMate. Please use a different email or sign in.';
const PHONE_MESSAGE = 'This phone number is already registered on BuildMate. Please use a different phone number.';
const BOTH_MESSAGE = 'This email and phone number are already registered on BuildMate.';
const VN_MOBILE = /^(03|05|07|08|09)\d{8}$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function digitsOf(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const kept = raw.replace(/[^\d+]/g, '');
  if (kept.startsWith('+')) return kept.slice(1).replace(/\D/g, '');
  return kept.replace(/\D/g, '');
}

function normalizeVnMobile(value) {
  let digits = digitsOf(value);
  if (!digits) return '';
  if (digits.startsWith('840') && digits.length === 12) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('84') && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function isValidVnMobile(value) {
  return VN_MOBILE.test(String(value || ''));
}

function storedVnMobile(value) {
  if (value == null || value === '') return null;
  const normalized = normalizeVnMobile(value);
  return normalized || null;
}

function phoneLookupValues(value) {
  const raw = String(value || '').trim();
  const normalized = normalizeVnMobile(raw);
  const values = [raw, normalized];
  if (normalized.startsWith('0') && normalized.length === 10) {
    values.push(`+84${normalized.slice(1)}`, `84${normalized.slice(1)}`);
  }
  return [...new Set(values.filter(Boolean))];
}

function collectErrorChain(err) {
  const chain = [];
  let current = err;
  let depth = 0;
  while (current && depth < 6) {
    chain.push(current);
    current = current.cause || current.original;
    depth += 1;
  }
  return chain;
}

function prismaTargetText(err) {
  const parts = [];
  for (const item of collectErrorChain(err)) {
    const meta = item?.meta || {};
    parts.push(
      meta.target,
      meta.constraint,
      meta.modelName,
      item?.message,
      item?.code,
      item?.constraint,
      item?.detail
    );
    if (Array.isArray(meta.target)) parts.push(meta.target.join(' '));
  }
  return parts.map((item) => String(item || '').toLowerCase()).join(' ');
}

function identityFieldsFromPrisma(err) {
  const text = prismaTargetText(err);
  const email = /\bemail\b/.test(text) || text.includes('uq_users_email');
  const phone = /\bphone(_number)?\b/.test(text) || text.includes('uq_users_phone');
  return { email, phone };
}

function isPrismaUniqueConflict(err) {
  return collectErrorChain(err).some((item) => {
    const code = item?.code;
    if (code === 'P2002' || code === '23505' || Number(code) === 23505) return true;
    return /unique constraint|duplicate key value/i.test(String(item?.message || ''));
  });
}

function isUsersIdentityUniqueConflict(err) {
  const text = prismaTargetText(err);
  return text.includes('uq_users_') || /\busers\b/.test(text);
}

module.exports = {
  EMAIL_ALREADY_EXISTS,
  PHONE_ALREADY_EXISTS,
  ACCOUNT_IDENTITY_CONFLICT,
  EMAIL_MESSAGE,
  PHONE_MESSAGE,
  BOTH_MESSAGE,
  normalizeEmail,
  normalizeVnMobile,
  storedVnMobile,
  isValidVnMobile,
  phoneLookupValues,
  identityFieldsFromPrisma,
  isPrismaUniqueConflict,
  isUsersIdentityUniqueConflict,
};
