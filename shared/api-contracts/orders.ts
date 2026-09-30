import type { ApiResponse } from '../types/user';
import type { Order, OrderDetail, ProgressStatus, ProgressUpdate } from '../types/order';

export type CustomerOrdersResponse = ApiResponse<Order[]>;
export type ContractorOrdersResponse = ApiResponse<Order[]>;
export type OrderDetailResponse = ApiResponse<OrderDetail>;
export type OrderProgressResponse = ApiResponse<ProgressUpdate[]>;

export interface AddProgressRequest {
  status: ProgressStatus;
  description?: string;
  images?: string[];
}

export interface CancelOrderRequest {
  reason?: string;
}
