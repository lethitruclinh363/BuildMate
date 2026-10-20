import type { AxiosRequestConfig } from 'axios';
import { api } from '@/lib/api';

/** Identifiers only. Price, distance, and shipping are recalculated on the server. */
export interface MaterialCheckoutDraft {
  storeId: string;
  address: string;
  lat: number;
  lng: number;
  items: Array<{ materialId: string; quantity: number }>;
}

export interface MaterialCheckoutLine {
  materialId: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface MaterialCheckoutQuote {
  ok: boolean;
  code: 'DELIVERY_DISABLED' | 'OUT_OF_RANGE' | 'BELOW_MINIMUM' | null;
  distanceKm: number | null;
  chargeableDistanceKm: number | null;
  serviceRadiusKm: number;
  minimumOrderAmount: number;
  materialSubtotal: number;
  shippingFee: number | null;
  orderTotal: number | null;
  depositAmount: number | null;
  remainingAmount: number | null;
  depositRate: number;
  storeId: string;
  storeName: string;
  address: string;
  lines: MaterialCheckoutLine[];
}

export const materialCheckoutApi = {
  quote: (body: MaterialCheckoutDraft, config?: AxiosRequestConfig) =>
    api.post<{ data: MaterialCheckoutQuote }>('/material-checkout/quote', body, { silent: true, ...config }),
};
