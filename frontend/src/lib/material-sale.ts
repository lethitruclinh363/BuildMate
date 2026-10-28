import type { CatalogMaterial } from '@/types/partner';

export type SaleState = 'selling' | 'out' | 'paused' | 'discontinued';
export type ListingStatus = 'ACTIVE' | 'PAUSED' | 'DISCONTINUED';

type SaleInput = {
  listingStatus?: CatalogMaterial['listingStatus'];
  isActive?: boolean;
  saleAvailability?: CatalogMaterial['saleAvailability'];
  stock?: number;
  saleState?: SaleState;
};

export function listingOf(item: SaleInput): ListingStatus {
  if (item.listingStatus === 'PAUSED' || item.listingStatus === 'DISCONTINUED' || item.listingStatus === 'ACTIVE') {
    return item.listingStatus;
  }
  return item.isActive === false ? 'PAUSED' : 'ACTIVE';
}

export function saleState(item: SaleInput): SaleState {
  if (item.saleState) return item.saleState;
  const listing = listingOf(item);
  if (listing === 'DISCONTINUED') return 'discontinued';
  if (listing === 'PAUSED') return 'paused';
  if (Number(item.stock) <= 0 || item.saleAvailability === 'MANUALLY_UNAVAILABLE') return 'out';
  return 'selling';
}

export function purchasable(item: SaleInput) {
  return saleState(item) === 'selling';
}

/** Public catalog may list a discontinued product, but must not show its selling price. */
export function publicPriceVisible(item: SaleInput) {
  return saleState(item) !== 'discontinued';
}

export function saleTone(state: SaleState): 'success' | 'warn' | 'mist' | 'danger' {
  if (state === 'selling') return 'success';
  if (state === 'out') return 'warn';
  if (state === 'discontinued') return 'danger';
  return 'mist';
}

export function saleNoticeKey(state: SaleState) {
  if (state === 'out') return 'materialPage.outCustomer';
  if (state === 'paused') return 'materialPage.pausedCustomer';
  if (state === 'discontinued') return 'materialPage.discontinuedCustomer';
  return '';
}

export function saleBannerKey(state: SaleState) {
  if (state === 'out') return 'materialPage.outBanner';
  if (state === 'paused') return 'materialPage.pausedBanner';
  if (state === 'discontinued') return 'materialPage.discontinuedBanner';
  return '';
}

export function saleLabelKey(state: SaleState) {
  if (state === 'out') return 'materialPage.saleOut';
  if (state === 'paused') return 'materialPage.salePaused';
  if (state === 'discontinued') return 'materialPage.saleDiscontinued';
  return 'materialPage.saleSelling';
}
