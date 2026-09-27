import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { Complaint } from '../types/complaint.types';

export const complaintApi = {
  create: (body: { orderId: string; againstUser: string; reason: string; description: string }) =>
    api.post<ApiResponse<Complaint>>('/complaints', body),
  mine: () => api.get<ApiResponse<Complaint[]>>('/complaints/my'),
};
