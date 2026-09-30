import { useCallback } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import i18n, { setAppLanguage, translateApiError } from '@/locales/i18n';
import { resolveKey, type Locale } from '@/locales/storage';

type Vars = Record<string, string | number>;

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useI18n() {
  const { t: i18t, i18n: instance } = useTranslation();
  const locale: Locale = instance.language?.startsWith('en') ? 'en' : 'vi';

  const t = useCallback(
    (path: string, vars?: Vars) => {
      const { ns, key } = resolveKey(path);
      return i18t(key, { ns, ...vars });
    },
    [i18t]
  );

  const te = useCallback((message?: string) => translateApiError(message, locale), [locale]);

  const setLocale = useCallback((next: Locale) => {
    void setAppLanguage(next);
  }, []);

  return { locale, setLocale, t, te };
}

export type { Locale };
