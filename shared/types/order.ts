export type OrderStatus =
  | 'REQUEST_CREATED'
  | 'QUOTATION_SENT'
  | 'QUOTATION_ACCEPTED'
  | 'DEPOSIT_PAID'
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CUSTOMER_ACCEPTED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type ProgressStatus = 'STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Order {
  id: string;
  title: string;
  status: OrderStatus;
  customerId?: string;
  contractorId?: string;
  orderCode?: string;
  description?: string;
  amount?: number;
  total?: number;
  createdAt?: string;
  updatedAt?: string;
  requestId?: string;
  quotationId?: string;
  [key: string]: unknown;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  method?: string;
  status: PaymentStatus;
  amount?: number;
  createdAt?: string;
}

export interface ProgressUpdate {
  id: string;
  status: ProgressStatus;
  description: string;
  images: string[];
  createdAt: string;
  actorId?: string | null;
  [key: string]: unknown;
}

export interface OrderDetail extends Order {
  items?: Array<{ id: string; name: string; quantity: number; price: number; type?: string; unit?: string }>;
  customer?: { id: string; name: string; email?: string; phone?: string } | null;
  contractor?: { id: string; name: string; email?: string; phone?: string } | null;
  progress?: ProgressUpdate[];
  payment?: OrderPayment | null;
  roomId?: string;
}

export interface ProgressSubmitResult {
  progress: ProgressUpdate;
  order: Order;
  notification?: { id: string; type: string } | null;
}

export type OrderFilter = 'all' | 'processing' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
