export type ReviewTargetType = 'CONTRACTOR' | 'MATERIAL_STORE';

export interface Review {
  id: string;
  orderId: string;
  customerId: string;
  targetUserId: string;
  targetType: ReviewTargetType;
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
}

export interface ReviewListPayload {
  average: number;
  count: number;
  items: Review[];
}
