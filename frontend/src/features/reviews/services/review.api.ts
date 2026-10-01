import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { PublicHighlights } from '@/types/marketplace';
import type { Review, ReviewListPayload, ReviewTargetType } from '../types/review.types';

export const reviewApi = {
  create: (body: { orderId: string; targetUserId: string; targetType?: ReviewTargetType; rating: number; comment?: string }) =>
    api.post<ApiResponse<Review>>('/reviews', body),
  forUser: (userId: string, targetType?: ReviewTargetType) =>
    api.get<ApiResponse<ReviewListPayload>>(`/reviews/user/${userId}`, {
      params: targetType ? { targetType } : undefined,
    }),
  dashboard: () =>
    api.get<ApiResponse<{ reviews: ReviewListPayload; highlights: PublicHighlights }>>('/contractor/reputation'),
  reply: (id: string, reply: string) => api.post<ApiResponse<Review>>(`/reviews/${id}/reply`, { reply }),
  report: (id: string, reason: string) => api.post<ApiResponse<{ reported: boolean }>>(`/reviews/${id}/report`, { reason }),
};
