import type { AdminPartnerStore, PartnerApplication, VerificationDocument } from '@/types/admin';
import { extractApplicationCoords } from '@/pages/verification/AdminLocationSection';

const SENSITIVE_DOCS = new Set(['CCCD_FRONT', 'CCCD_BACK', 'ID_CARD']);

export function serviceTitle(translate: (key: string) => string, name: string) {
  const hit = translate(`serviceCatalog.${name}`);
  if (!hit || hit === '—' || hit === `serviceCatalog.${name}`) return name;
  return hit;
}

export function categoryTitle(translate: (key: string) => string, item: { name: string; type?: string }) {
  if (item.type === 'CUSTOM') return item.name;
  const key = `category.${item.name}`;
  const hit = translate(key);
  if (!hit || hit === '—' || hit === key) return item.name;
  return hit;
}

export function statusTone(status?: string): 'success' | 'warn' | 'danger' | 'navy' {
  if (status === 'APPROVED' || status === 'ACTIVE' || status === 'LIVE') return 'success';
  if (status === 'SUBMITTED' || status === 'PENDING_APPROVAL' || status === 'PENDING_EMAIL') return 'warn';
  if (status === 'REJECTED' || status === 'BLOCKED' || status === 'BANNED') return 'danger';
  return 'navy';
}

export function extractProfileCoords(profile: PartnerApplication): { lat: number; lng: number } | null {
  const fromProfile = extractApplicationCoords(profile);
  if (fromProfile) return fromProfile;
  const store = profile.store;
  const lat = store?.lat != null ? Number(store.lat) : null;
  const lng = store?.lng != null ? Number(store.lng) : null;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function publicDocuments(docs: VerificationDocument[] = []) {
  return docs.filter((doc) => !SENSITIVE_DOCS.has(doc.type) && !String(doc.url || '').startsWith('private:'));
}

export function uniqueUrls(urls: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const url of urls) {
    const value = String(url || '').trim();
    if (!value || seen.has(value) || value.startsWith('private:')) continue;
    seen.add(value);
    list.push(value);
  }
  return list;
}

export function storeHero(store?: AdminPartnerStore | null, portfolio?: PartnerApplication['portfolio'], userAvatar?: string) {
  return uniqueUrls([
    store?.logo,
    store?.avatar,
    store?.coverImage,
    portfolio?.teamLogo,
    portfolio?.avatar,
    userAvatar,
  ])[0] || '';
}
