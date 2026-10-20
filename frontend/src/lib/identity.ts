const VN_MOBILE = /^(03|05|07|08|09)\d{8}$/;

export function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

function digitsOf(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const kept = raw.replace(/[^\d+]/g, '');
  if (kept.startsWith('+')) return kept.slice(1).replace(/\D/g, '');
  return kept.replace(/\D/g, '');
}

export function normalizeVnMobile(value: string) {
  let digits = digitsOf(value);
  if (!digits) return '';
  if (digits.startsWith('840') && digits.length === 12) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('84') && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isValidVnMobile(value: string) {
  return VN_MOBILE.test(String(value || ''));
}
