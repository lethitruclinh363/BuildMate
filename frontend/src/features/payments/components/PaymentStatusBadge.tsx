import { Badge } from '@/components/ui/Badge';
import { labeled, useI18n } from '@/locales';
import type { PaymentStatus } from '../types/payment.types';
import { paymentStatusTone } from '../types/paymentStatus';

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useI18n();
  return <Badge tone={paymentStatusTone(status)}>{labeled(t, 'paymentStatus', status)}</Badge>;
}
