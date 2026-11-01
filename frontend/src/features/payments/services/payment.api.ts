import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { CheckoutResult, EarningsPayload, OrderPaymentsPayload } from '../types/payment.types';

export const paymentApi = {
  byOrder: (orderId: string) => api.get<ApiResponse<OrderPaymentsPayload>>(`/payments/order/${orderId}`),
  byQuotation: (quotationId: string) =>
    api.get<ApiResponse<OrderPaymentsPayload>>(`/payments/quotation/${quotationId}`),
  checkout: (id: string, method = 'MOCK', extra: { termsAccepted?: boolean; termsVersion?: string } = {}) =>
    api.post<ApiResponse<CheckoutResult>>(`/payments/${id}/checkout`, { method, ...extra }),
  mockSuccess: (id: string) => api.post<ApiResponse<CheckoutResult>>(`/payments/${id}/mock-success`),
};

export const earningsApi = {
  mine: () => api.get<ApiResponse<EarningsPayload>>('/contractor/earnings'),
};
