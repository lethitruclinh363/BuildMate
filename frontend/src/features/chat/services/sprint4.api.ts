import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { AppNotification, ChatMessage, ChatRoom, Quotation, RepairRequest } from '@/types/sprint4';

export const repairApi = {
  create: (form: FormData) =>
    api.post<ApiResponse<RepairRequest>>('/repair-requests', form, { timeout: 60000 }),
  mine: () => api.get<ApiResponse<RepairRequest[]>>('/repair-requests/my'),
  received: () => api.get<ApiResponse<RepairRequest[]>>('/repair-requests/received'),
  get: (id: string) => api.get<ApiResponse<RepairRequest>>(`/repair-requests/${id}`),
  accept: (id: string) => api.patch<ApiResponse<RepairRequest>>(`/repair-requests/${id}/accept`),
  reject: (id: string) => api.patch<ApiResponse<RepairRequest>>(`/repair-requests/${id}/reject`),
};

export const chatApi = {
  rooms: () => api.get<ApiResponse<ChatRoom[]>>('/chat/rooms'),
  room: (id: string) => api.get<ApiResponse<ChatRoom>>(`/chat/rooms/${id}`),
  messages: (id: string) => api.get<ApiResponse<ChatMessage[]>>(`/chat/rooms/${id}/messages`),
  send: (id: string, content: string) =>
    api.post<ApiResponse<ChatMessage>>(`/chat/rooms/${id}/messages`, { type: 'TEXT', content }),
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
  accept: (id: string) => api.patch<ApiResponse<Quotation>>(`/quotations/${id}/accept`),
  reject: (id: string) => api.patch<ApiResponse<Quotation>>(`/quotations/${id}/reject`),
  requestModify: (id: string, note: string) =>
    api.patch<ApiResponse<Quotation>>(`/quotations/${id}/request-modification`, { note }),
};

export const notificationApi = {
  list: () => api.get<ApiResponse<{ items: AppNotification[]; unread: number }>>('/notifications'),
  read: (id: string) => api.patch(`/notifications/${id}/read`),
  readAll: () => api.patch('/notifications/read-all'),
};
