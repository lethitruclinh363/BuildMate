export const STORAGE_KEY = 'buildmate-language';
export const NAMESPACES = ['common', 'auth', 'dashboard', 'marketplace', 'chat', 'quotation', 'orders', 'finance', 'ekyc'] as const;
export type Locale = 'vi' | 'en';

const PREFIX_NS: Record<string, (typeof NAMESPACES)[number]> = {
  brand: 'common',
  common: 'common',
  role: 'common',
  status: 'common',
  storeType: 'common',
  itemType: 'common',
  category: 'common',
  serviceCatalog: 'common',
  nav: 'common',
  header: 'common',
  errors: 'common',
  notify: 'common',
  docType: 'common',
  language: 'common',
  auth: 'auth',
  customerHome: 'dashboard',
  contractorHome: 'dashboard',
  verify: 'dashboard',
  publicProfile: 'dashboard',
  storePublic: 'dashboard',
  deliveryPolicy: 'dashboard',
  activation: 'dashboard',
  storePage: 'dashboard',
  servicePage: 'dashboard',
  materialPage: 'dashboard',
  contractorRequests: 'dashboard',
  forms: 'dashboard',
  settings: 'dashboard',
  landing: 'marketplace',
  explore: 'marketplace',
  map: 'marketplace',
  public: 'marketplace',
  request: 'marketplace',
  cart: 'marketplace',
  chat: 'chat',
  quote: 'quotation',
  quotation: 'quotation',
  orders: 'orders',
  materialOrder: 'orders',
  pay: 'finance',
  paymentStatus: 'finance',
  review: 'finance',
  reputation: 'finance',
  stars: 'finance',
  complaint: 'finance',
  complaintStatus: 'finance',
  complaintReason: 'finance',
  earn: 'finance',
  analytics: 'finance',
  toast: 'finance',
  ekyc: 'ekyc',
};

export function readStoredLanguage(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'vi';
    const parsed = JSON.parse(raw) as { language?: string } | string;
    const lang = typeof parsed === 'string' ? parsed : parsed.language;
    return lang === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

export function persistLanguage(language: Locale) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ language }));
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
}

/** Aliases whose locale file stores keys at the root (not nested under the alias name). */
const FLAT_ALIAS_PREFIXES = new Set(['quote']);

export function resolveKey(path: string): { ns: (typeof NAMESPACES)[number]; key: string } {
  const first = path.split('.')[0];
  const ns = PREFIX_NS[first] ?? 'common';
  if (!path.includes('.')) {
    return { ns, key: path };
  }
  // Same name as namespace → strip (chat.placeholder → placeholder in chat.json)
  if (first === ns) {
    return { ns, key: path.slice(first.length + 1) };
  }
  // Flat-root alias → strip (quote.title → title in quotation.json)
  if (FLAT_ALIAS_PREFIXES.has(first)) {
    return { ns, key: path.slice(first.length + 1) };
  }
  // Nested under alias in target ns (pay.eyebrow → pay.eyebrow in finance.json)
  return { ns, key: path };
}
