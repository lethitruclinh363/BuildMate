import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

const KEY = 'buildmate-admin-language';

export function getStoredLanguage(): 'vi' | 'en' {
  const stored = localStorage.getItem(KEY);
  return stored === 'en' ? 'en' : 'vi';
}

void i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  lng: typeof window === 'undefined' ? 'vi' : getStoredLanguage(),
  fallbackLng: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  parseMissingKeyHandler: () => '—',
  returnedObjectHandler: () => '—',
});

export function setAdminLanguage(lng: 'vi' | 'en') {
  localStorage.setItem(KEY, lng);
  void i18n.changeLanguage(lng);
}

export default i18n;
