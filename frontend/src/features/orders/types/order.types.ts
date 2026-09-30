import type { Order, ProgressUpdate } from '@buildmate/shared/types/order';

export type {
  OrderStatus,
  PaymentStatus,
  ProgressStatus,
  GeoPoint,
  Order,
  OrderPayment,
  ProgressUpdate,
  OrderDetail,
} from '@buildmate/shared/types/order';

export type OrderFilter = 'all' | 'processing' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';

export interface ProgressSubmitResult {
  progress: ProgressUpdate;
  order: Order;
  notification?: { id: string; type: string } | null;
}
