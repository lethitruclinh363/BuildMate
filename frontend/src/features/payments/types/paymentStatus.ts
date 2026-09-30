import type { PaymentStatus } from './payment.types';

type Tone = 'navy' | 'copper' | 'mist' | 'success' | 'warn' | 'danger';

export function paymentStatusTone(status: PaymentStatus): Tone {
  if (status === 'PAID') return 'success';
  if (status === 'PENDING') return 'warn';
  if (status === 'FAILED' || status === 'REFUNDED') return 'danger';
  return 'mist';
}

export function canCheckout(status: PaymentStatus) {
  return status === 'UNPAID' || status === 'FAILED';
}
