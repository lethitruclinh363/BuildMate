import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type {
  Order,
  OrderDetail,
  ProgressStatus,
  ProgressSubmitResult,
  ProgressUpdate,
} from '../types/order.types';

export const orderApi = {
  customer: () => api.get<ApiResponse<Order[]>>('/orders/customer'),
  contractor: () => api.get<ApiResponse<Order[]>>('/orders/contractor'),
  get: (id: string) => api.get<ApiResponse<OrderDetail>>(`/orders/${id}`),
  progress: (id: string) => api.get<ApiResponse<ProgressUpdate[]>>(`/orders/${id}/progress`),
  complete: (id: string) => api.post<ApiResponse<{ order: Order }>>(`/orders/${id}/complete`),
  confirmRemaining: (id: string) => api.post<ApiResponse<{ order: Order }>>(`/orders/${id}/remaining-received`),
  settleEscrow: (id: string) => api.post<ApiResponse<{ order: Order }>>(`/orders/${id}/settle-escrow`),
  cancel: (id: string, reason?: string) =>
    api.post<ApiResponse<Order>>(`/orders/${id}/cancel`, { reason }),
  addProgress: (id: string, body: { status: ProgressStatus; description: string; images?: File[] }) => {
    const form = new FormData();
    form.append('status', body.status);
    form.append('description', body.description);
    (body.images || []).forEach((file) => form.append('images', file));
    return api.post<ApiResponse<ProgressSubmitResult>>(`/orders/${id}/progress`, form, { timeout: 60000 });
  },
};
