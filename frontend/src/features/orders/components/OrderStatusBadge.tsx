import { Badge } from '@/components/ui/Badge';
import { labeled, useI18n } from '@/locales';
import { displayOrderStatus, orderStatusTone } from '../types/orderStatus';

export function OrderStatusBadge({ status, customerView }: { status: string; customerView?: boolean }) {
  const { t } = useI18n();
  const shown = displayOrderStatus(status);
  const group = customerView ? 'orders.customerStatus' : 'orders.status';
  const label = shown === 'UNKNOWN' ? t('orders.status.fallback') : labeled(t, group, shown);
  return <Badge tone={orderStatusTone(status)}>{label}</Badge>;
}
