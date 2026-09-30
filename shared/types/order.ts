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

export type RepairJobStatus = OrderStatus;

export type PaymentStatus = 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED';

export type ProgressStatus = 'STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface Order {
  id: string;
  orderCode: string;
  quotationId: string;
  requestId: string;
  customerId: string;
  contractorId: string;
  storeId: string | null;
  title: string;
  description: string;
  location: GeoPoint;
  amount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelReason?: string;
  cancelledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressUpdate {
  id: string;
  orderId: string;
  status: ProgressStatus;
  description: string;
  images: string[];
  location: GeoPoint | null;
  createdAt: string;
}

export interface OrderDetail extends Order {
  payment: OrderPayment | null;
  assignments: [];
}
