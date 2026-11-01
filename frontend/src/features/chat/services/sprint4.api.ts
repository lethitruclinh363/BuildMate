import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { AppNotification, ChatMessage, ChatRoom, Quotation, QuotationAcceptBundle, RepairRequest } from '@/types/sprint4';

export const repairApi = {
  create: (form: FormData) =>
    api.post<ApiResponse<RepairRequest>>('/repair-requests', form, { timeout: 60000 }),
  mine: () => api.get<ApiResponse<RepairRequest[]>>('/repair-requests/my'),
  received: () => api.get<ApiResponse<RepairRequest[]>>('/repair-requests/received'),
  get: (id: string) => api.get<ApiResponse<RepairRequest>>(`/repair-requests/${id}`),
  accept: (id: string) => api.patch<ApiResponse<RepairRequest>>(`/repair-requests/${id}/accept`),
  reject: (id: string) => api.patch<ApiResponse<RepairRequest>>(`/repair-requests/${id}/reject`),
  cancel: (id: string) => api.patch<ApiResponse<RepairRequest>>(`/repair-requests/${id}/cancel`),
};

export const chatApi = {
  rooms: () => api.get<ApiResponse<ChatRoom[]>>('/chat/rooms'),
  room: (id: string) => api.get<ApiResponse<ChatRoom>>(`/chat/rooms/${id}`),
  openStoreRoom: (storeId: string) =>
    api.post<ApiResponse<ChatRoom>>(`/chat/stores/${storeId}/rooms`, {}),
  messages: (id: string, limit = 50) =>
    api.get<ApiResponse<ChatMessage[]>>(`/chat/rooms/${id}/messages`, { params: { limit } }),
  send: (id: string, content: string) =>
    api.post<ApiResponse<ChatMessage>>(`/chat/rooms/${id}/messages`, { type: 'TEXT', content }),
  sendLocation: (id: string, location: { lat: number; lng: number; address: string; label: string }) =>
    api.post<ApiResponse<ChatMessage>>(`/chat/rooms/${id}/messages`, { type: 'LOCATION', location }),
  media: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ApiResponse<ChatMessage>>(`/chat/rooms/${id}/media`, form, { timeout: 60000 });
  },
};

export const quotationApi = {
  create: (body: {
    requestId: string;
    items: { type: 'MATERIAL' | 'LABOR'; name: string; quantity: number; unit?: string; price: number }[];
    transportCost: number;
    estimatedDays: number;
    note?: string;
  }) => api.post<ApiResponse<Quotation>>('/quotations', body),
  get: (id: string) => api.get<ApiResponse<Quotation>>(`/quotations/${id}`),
  forRequest: (requestId: string) =>
    api.get<ApiResponse<Quotation[]>>(`/quotations/request/${requestId}`),
  accept: (id: string) => api.patch<ApiResponse<QuotationAcceptBundle>>(`/quotations/${id}/accept`),
  reject: (id: string) => api.patch<ApiResponse<Quotation>>(`/quotations/${id}/reject`),
  requestModify: (id: string, note: string) =>
    api.patch<ApiResponse<Quotation>>(`/quotations/${id}/request-modification`, { note }),
};

type NotificationPage = ApiResponse<{ items: AppNotification[]; unread: number; total: number; page: number }>;
const notificationLoads = new Map<string, Promise<import('axios').AxiosResponse<NotificationPage>>>();

export const notificationApi = {
  list: (page = 1, limit = 40) => {
    const key = `${page}:${limit}`;
    const current = notificationLoads.get(key);
    if (current) return current;
    const request = api
      .get<NotificationPage>('/notifications', { params: { page, limit } })
      .finally(() => {
        notificationLoads.delete(key);
      });
    notificationLoads.set(key, request);
    return request;
  },
  read: (id: string) => api.patch(`/notifications/${id}/read`),
  readAll: () => api.patch('/notifications/read-all'),
};
