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

import commonEn from '@/locales/en/common.json';
import authEn from '@/locales/en/auth.json';
import dashboardEn from '@/locales/en/dashboard.json';
import marketplaceEn from '@/locales/en/marketplace.json';
import chatEn from '@/locales/en/chat.json';
import quotationEn from '@/locales/en/quotation.json';
import ordersEn from '@/locales/en/orders.json';
import financeEn from '@/locales/en/finance.json';

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

export function translateApiError(message: string | undefined, locale: Locale = currentLocale()): string {
  if (!message) return translate(locale, 'errors.generic');
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
