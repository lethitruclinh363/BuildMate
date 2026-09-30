import type { ApiResponse } from '../types/user';
import type { Quotation, QuotationItem } from '../types/quotation';
import type { Order, OrderPayment } from '../types/order';
import type { AppNotification } from '../types/notification';

export interface CreateQuotationRequest {
  requestId: string;
  items: QuotationItem[];
  transportCost?: number;
  estimatedDays?: number;
  note?: string;
}

export type QuotationResponse = ApiResponse<Quotation>;
export type QuotationListResponse = ApiResponse<Quotation[]>;

export type AcceptQuotationResponse = ApiResponse<
  Quotation & {
    quotation: Quotation;
    order: Order;
    payment: OrderPayment | null;
    notification: AppNotification | null;
  }
>;
