import { api } from '@/lib/api';

export interface MaterialOrderItem {
  materialId: string;
  nameSnapshot: string;
  imageSnapshot: string;
  unitSnapshot: string;
  priceSnapshot: number;
  quantity: number;
  lineTotal: number;
}

export interface MaterialOrder {
  id: string;
  orderCode: string;
  customerId: string;
  storeId: string;
  storeOwnerId: string;
  items: MaterialOrderItem[];
  deliveryAddress: string;
  deliveryLocation?: { type: 'Point'; coordinates: [number, number] } | null;
  place?: { lat: number; lng: number; address: string; label: string } | null;
  distanceKm: number;
  materialSubtotal: number;
  shippingFee: number;
  totalAmount: number;
  depositRateSnapshot: number;
  depositAmount: number;
  platformFeeRateSnapshot: number;
  platformFeeAmount: number;
  storeDepositAmount: number;
  remainingAmount: number;
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  status:
    | 'PENDING_PAYMENT'
    | 'DEPOSIT_PAID'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'READY_FOR_DELIVERY'
    | 'DELIVERING'
    | 'DELIVERED'
    | 'CUSTOMER_RECEIVED'
    | 'COMPLETED'
    | 'CANCELLED';
  customerNote: string;
  remainingSettledOffline?: boolean;
  customer?: { id: string; name: string };
  storeName?: string;
  statusHistory?: Array<{ status: string; createdAt?: string; note?: string; actorRole?: string }>;
  createdAt: string;
}

export interface CreateMaterialOrderBody {
  storeId: string;
  deliveryAddress: string;
  lat: number;
  lng: number;
  customerNote?: string;
  items: Array<{ materialId: string; quantity: number }>;
}

export interface MaterialEarnings {
  orderValue: number;
  onlineDeposits: number;
  platformFees: number;
  storeDeposits: number;
  directRemaining: number;
}

const NEXT_STORE_STATUS: Partial<Record<MaterialOrder['status'], MaterialOrder['status']>> = {
  DEPOSIT_PAID: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY_FOR_DELIVERY',
  READY_FOR_DELIVERY: 'DELIVERING',
  DELIVERING: 'DELIVERED',
};

export function nextStoreStatus(status: MaterialOrder['status']) {
  return NEXT_STORE_STATUS[status] || null;
}

export const materialOrderApi = {
  mine: () => api.get<{ data: MaterialOrder[] }>('/material-orders/my', { silent: true }),
  create: (body: CreateMaterialOrderBody) =>
    api.post<{ data: MaterialOrder }>('/material-orders', body, { silent: true }),
  get: (id: string) => api.get<{ data: MaterialOrder }>(`/material-orders/${id}`, { silent: true }),
  checkoutDeposit: (id: string) =>
    api.post<{ data: { order: MaterialOrder; duplicated: boolean } }>(
      `/material-orders/${id}/deposit/checkout`,
      { method: 'MOCK' },
      { silent: true }
    ),
  captureDeposit: (id: string) =>
    api.post<{ data: { order: MaterialOrder; duplicated: boolean } }>(
      `/material-orders/${id}/deposit/mock-success`,
      {},
      { silent: true }
    ),
  cancel: (id: string) => api.post<{ data: MaterialOrder }>(`/material-orders/${id}/cancel`, {}, { silent: true }),
  receive: (id: string) => api.post<{ data: MaterialOrder }>(`/material-orders/${id}/receive`, {}, { silent: true }),
  settleRemaining: (id: string) =>
    api.post<{ data: MaterialOrder }>(`/material-orders/${id}/remaining-settled`, { settled: true }, { silent: true }),
};

export const materialStoreOrderApi = {
  list: () => api.get<{ data: MaterialOrder[] }>('/material-store/orders', { silent: true }),
  get: (id: string) => api.get<{ data: MaterialOrder }>(`/material-store/orders/${id}`, { silent: true }),
  updateStatus: (id: string, status: MaterialOrder['status']) =>
    api.patch<{ data: MaterialOrder }>(`/material-store/orders/${id}`, { status }, { silent: true }),
  earnings: () => api.get<{ data: MaterialEarnings }>('/material-store/earnings', { silent: true }),
};
