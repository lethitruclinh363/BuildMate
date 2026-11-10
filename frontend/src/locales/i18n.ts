import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';
import { NAMESPACES, persistLanguage, readStoredLanguage, resolveKey, type Locale } from '@/locales/storage';

import commonVi from '@/locales/vi/common.json';
import authVi from '@/locales/vi/auth.json';
import dashboardVi from '@/locales/vi/dashboard.json';
import marketplaceVi from '@/locales/vi/marketplace.json';
import chatVi from '@/locales/vi/chat.json';
import quotationVi from '@/locales/vi/quotation.json';
import ordersVi from '@/locales/vi/orders.json';
import financeVi from '@/locales/vi/finance.json';
import ekycVi from '@/locales/vi/ekyc.json';

import commonEn from '@/locales/en/common.json';
import authEn from '@/locales/en/auth.json';
import dashboardEn from '@/locales/en/dashboard.json';
import marketplaceEn from '@/locales/en/marketplace.json';
import chatEn from '@/locales/en/chat.json';
import quotationEn from '@/locales/en/quotation.json';
import ordersEn from '@/locales/en/orders.json';
import financeEn from '@/locales/en/finance.json';
import ekycEn from '@/locales/en/ekyc.json';

type Vars = Record<string, string | number>;

const initial = typeof window === 'undefined' ? 'vi' : readStoredLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    vi: {
      common: commonVi,
      auth: authVi,
      dashboard: dashboardVi,
      marketplace: marketplaceVi,
      chat: chatVi,
      quotation: quotationVi,
      orders: ordersVi,
      finance: financeVi,
      ekyc: ekycVi,
    },
    en: {
      common: commonEn,
      auth: authEn,
      dashboard: dashboardEn,
      marketplace: marketplaceEn,
      chat: chatEn,
      quotation: quotationEn,
      orders: ordersEn,
      finance: financeEn,
      ekyc: ekycEn,
    },
  },
  lng: initial,
  fallbackLng: false,
  defaultNS: 'common',
  ns: [...NAMESPACES],
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
  returnNull: false,
  parseMissingKeyHandler: () => '—',
  returnedObjectHandler: () => '—',
});

persistLanguage(initial);

function applyZodLocale() {
  z.setErrorMap((issue, ctx) => {
    const text = (path: string, vars?: Vars) => translate(currentLocale(), path, vars);
    if (issue.code === z.ZodIssueCode.invalid_string && issue.validation === 'email') {
      return { message: text('validation.email') };
    }
    if (issue.code === z.ZodIssueCode.too_small) {
      if (issue.type === 'string' && Number(issue.minimum) <= 1) return { message: text('validation.required') };
      if (issue.type === 'string') return { message: text('validation.minLength', { n: Number(issue.minimum) }) };
      if (issue.type === 'number' || issue.type === 'bigint') {
        return { message: text('validation.minNumber', { n: Number(issue.minimum) }) };
      }
      return { message: text('validation.required') };
    }
    if (issue.code === z.ZodIssueCode.too_big && (issue.type === 'string' || issue.type === 'number')) {
      return { message: text('validation.maxLength', { n: Number(issue.maximum) }) };
    }
    if (issue.code === z.ZodIssueCode.invalid_type && (issue.received === 'undefined' || issue.received === 'null')) {
      return { message: text('validation.required') };
    }
    if (ctx.defaultError) return { message: text('validation.invalid') };
    return { message: text('validation.invalid') };
  });
}

applyZodLocale();
i18n.on('languageChanged', applyZodLocale);

export default i18n;

export function currentLocale(): Locale {
  return i18n.language?.startsWith('en') ? 'en' : 'vi';
}

export async function setAppLanguage(locale: Locale) {
  await i18n.changeLanguage(locale);
  persistLanguage(locale);
}

export function translate(locale: Locale, path: string, vars?: Vars): string {
  const { ns, key } = resolveKey(path);
  return i18n.t(key, { lng: locale, ns, ...vars });
}

const KNOWN_API_ERRORS: Record<string, { vi: string; en: string }> = {
  'Please wait before requesting another verification code': {
    vi: 'Vui lòng đợi trước khi yêu cầu mã xác thực mới.',
    en: 'Please wait before requesting another verification code.',
  },
  'Too many incorrect verification codes. Request a new code later': {
    vi: 'Bạn đã nhập sai mã xác thực quá nhiều lần. Vui lòng thử lại sau.',
    en: 'Too many incorrect verification codes. Request a new code later.',
  },
  'Verification code has expired': {
    vi: 'Mã xác thực đã hết hạn. Vui lòng gửi lại mã mới.',
    en: 'Verification code has expired. Please request a new code.',
  },
  'Invalid verification code': {
    vi: 'Mã xác thực không chính xác.',
    en: 'Invalid verification code.',
  },
  'No verification code. Please request a new one': {
    vi: 'Chưa có mã xác thực. Vui lòng gửi lại mã mới.',
    en: 'No verification code. Please request a new one.',
  },
  'Email is already verified': {
    vi: 'Email này đã được xác thực thành công.',
    en: 'Email is already verified.',
  },
  'Account not found': {
    vi: 'Không tìm thấy tài khoản với email này.',
    en: 'Account not found.',
  },
  'Invalid email or password': {
    vi: 'Email hoặc mật khẩu không chính xác.',
    en: 'Invalid email or password.',
  },
  'Google sign-in is not configured': {
    vi: 'Đăng nhập Google chưa được cấu hình trên máy chủ.',
    en: 'Google sign-in is not configured on the server.',
  },
  'Google credential is invalid or expired': {
    vi: 'Thông tin xác thực Google không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
    en: 'The Google credential is invalid or expired. Please try again.',
  },
  'Google credential verification is temporarily unavailable': {
    vi: 'Tạm thời không thể xác minh tài khoản Google. Vui lòng thử lại sau.',
    en: 'Google verification is temporarily unavailable. Please try again.',
  },
  'Use a verified Gmail or Google Workspace account': {
    vi: 'Vui lòng dùng tài khoản Gmail hoặc Google Workspace đã xác thực.',
    en: 'Use a verified Gmail or Google Workspace account.',
  },
  'Google sign-in is available for customer accounts only': {
    vi: 'Đăng nhập Google chỉ dành cho tài khoản khách hàng.',
    en: 'Google sign-in is available for customer accounts only.',
  },
  'Could not send verification email. Please try resend-code.': {
    vi: 'Không thể gửi email xác thực. Vui lòng thử gửi lại mã.',
    en: 'Could not send verification email. Please try resend-code.',
  },
  'Bạn thao tác quá nhanh. Vui lòng chờ vài giây.': {
    vi: 'Bạn thao tác quá nhanh. Vui lòng chờ vài giây.',
    en: 'Too many requests. Please wait a few seconds.',
  },
  'Please verify your email': {
    vi: 'Vui lòng xác thực email của bạn trước khi đăng nhập.',
    en: 'Please verify your email before logging in.',
  },
  'This account has been suspended': {
    vi: 'Tài khoản này đã bị tạm ngưng.',
    en: 'This account has been suspended.',
  },
  'Reset code has expired': {
    vi: 'Mã xác thực đã hết hạn. Vui lòng gửi lại mã mới.',
    en: 'Reset code has expired. Please request a new one.',
  },
  'Invalid reset code': {
    vi: 'Mã xác thực không chính xác.',
    en: 'Invalid reset code.',
  },
  'No reset code. Please request a new one': {
    vi: 'Chưa có mã xác thực. Vui lòng gửi lại mã mới.',
    en: 'No reset code. Please request a new one.',
  },
  'Too many incorrect reset codes. Request a new code later': {
    vi: 'Bạn đã nhập sai mã xác thực quá nhiều lần. Vui lòng thử lại sau.',
    en: 'Too many incorrect reset codes. Request a new code later.',
  },
  'Reset code expired or was already used': {
    vi: 'Mã xác thực đã hết hạn hoặc đã được sử dụng.',
    en: 'Reset code expired or was already used.',
  },
  'Password must be at least 8 characters and include uppercase, lowercase, and a number': {
    vi: 'Mật khẩu tối thiểu 8 ký tự, gồm ít nhất 1 chữ hoa, 1 chữ thường và 1 số',
    en: 'Password must be at least 8 characters and include uppercase, lowercase, and a number',
  },
  'Password is required': {
    vi: 'Vui lòng nhập mật khẩu',
    en: 'Password is required',
  },
  'Password is too long': {
    vi: 'Mật khẩu quá dài',
    en: 'Password is too long',
  },
  'Pause this service instead. It already has repair jobs.': {
    vi: 'Không thể xóa dịch vụ đã có yêu cầu sửa chữa. Hãy tạm tắt dịch vụ này.',
    en: 'Pause this service instead. It already has repair jobs.',
  },
  'Complete this service before listing it': {
    vi: 'Hãy hoàn thiện dịch vụ trước khi bật lại.',
    en: 'Complete this service before listing it.',
  },
  'This partner does not offer that service': {
    vi: 'Đội thợ không còn cung cấp dịch vụ này.',
    en: 'This partner does not offer that service.',
  },
  'Service not found': {
    vi: 'Không tìm thấy dịch vụ.',
    en: 'Service not found.',
  },
  'Closing time must be after opening time': {
    vi: 'Giờ đóng cửa phải sau giờ mở cửa.',
    en: 'Closing time must be after opening time.',
  },
  'Choose valid opening and closing times': {
    vi: 'Hãy chọn giờ mở cửa và đóng cửa hợp lệ.',
    en: 'Choose valid opening and closing times.',
  },
  'Operating hours must include all 7 days': {
    vi: 'Giờ hoạt động phải gồm đủ 7 ngày trong tuần.',
    en: 'Operating hours must include all 7 days.',
  },
  'Invalid operating hours': {
    vi: 'Giờ hoạt động không hợp lệ.',
    en: 'Invalid operating hours.',
  },
};

export function translateApiError(message: string | undefined, locale: Locale = currentLocale()): string {
  if (!message) return translate(locale, 'errors.generic');
  if (KNOWN_API_ERRORS[message]) {
    return KNOWN_API_ERRORS[message][locale] || KNOWN_API_ERRORS[message].vi;
  }
  const { ns, key } = resolveKey(`errors.api.${message}`);
  const hit = i18n.t(key, { lng: locale, ns, defaultValue: '' });
  if (!hit || hit === '—' || hit === key) return message;
  return hit;
}

export function labeled(t: (path: string) => string, prefix: string, code: string) {
  const path = `${prefix}.${code}`;
  const hit = t(path);
  return hit === path ? code : hit;
}

export const t = (path: string, vars?: Vars) => translate(currentLocale(), path, vars);
export const te = (message?: string) => translateApiError(message, currentLocale());
