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
  customerName?: string;
  customerAvatar?: string;
  jobTitle?: string;
  contractorReply?: string;
  repliedAt?: string | null;
  reported?: boolean;
}

export interface ReviewListPayload {
  average: number;
  count: number;
  distribution?: Record<string, number>;
  items: Review[];
}
