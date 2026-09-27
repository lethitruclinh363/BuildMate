import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { Order } from '../types/order.types';
import { OrderStatusBadge } from './OrderStatusBadge';

interface OrderCardProps {
  order: Order;
  to: string;
  partyLabel?: string;
  partyHint?: string;
  customerView?: boolean;
}

export function OrderCard({ order, to, partyLabel, partyHint, customerView }: OrderCardProps) {
  const { t } = useI18n();
  const date = new Date(order.createdAt).toLocaleDateString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <Card hover={false} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-xs tracking-wide text-copper-600">{order.orderCode}</p>
        <h2 className="mt-1 font-display text-xl text-navy-800">{order.title}</h2>
        {partyLabel ? <p className="mt-1 text-sm text-ink-600">{partyLabel}</p> : null}
        {partyHint ? <p className="text-xs text-ink-400">{partyHint}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} customerView={customerView} />
          <span className="text-sm font-semibold text-navy-800">{vnd(order.amount)}</span>
          <span className="text-xs text-ink-400">{date}</span>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0 self-start">
        <Link to={to}>{t('common.viewDetail')}</Link>
      </Button>
    </Card>
  );
}
