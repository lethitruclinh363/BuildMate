import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { Review, ReviewListPayload, ReviewTargetType } from '../types/review.types';

export const reviewApi = {
  create: (body: { orderId: string; targetUserId: string; targetType?: ReviewTargetType; rating: number; comment?: string }) =>
    api.post<ApiResponse<Review>>('/reviews', body),
  forUser: (
    userId: string,
    targetType?: ReviewTargetType,
    params?: { rating?: number; sort?: 'newest' | 'oldest'; page?: number; pageSize?: number }
  ) =>
    api.get<ApiResponse<ReviewListPayload>>(`/reviews/user/${userId}`, {
      params: { ...(targetType ? { targetType } : {}), ...params },
    }),
  contractorReviews: (params: { rating?: number; sort?: 'newest' | 'oldest'; page?: number; pageSize?: number }) =>
    api.get<ApiResponse<ReviewListPayload>>('/contractor/reviews', { params }),
  storeReviews: (params: { rating?: number; sort?: 'newest' | 'oldest'; page?: number; pageSize?: number }) =>
    api.get<ApiResponse<ReviewListPayload>>('/material-store/reviews', { params }),
  reply: (id: string, reply: string) => api.post<ApiResponse<Review>>(`/reviews/${id}/reply`, { reply }),
  report: (id: string, reason: string) => api.post<ApiResponse<{ reported: boolean }>>(`/reviews/${id}/report`, { reason }),
};
