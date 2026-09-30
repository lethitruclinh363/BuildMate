import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { useI18n } from '@/locales';
import { OrderCard } from '@/features/orders/components/OrderCard';
import { useOrders } from '@/features/orders/hooks/useOrders';
import type { OrderFilter } from '@/features/orders/types/order.types';
import { matchesOrderFilter } from '@/features/orders/types/orderStatus';
import type { RepairRequest } from '@/types/sprint4';

type BoardFilter = OrderFilter | 'new';

export function ContractorOrdersPage() {
  const { t } = useI18n();
  const { items, loading, error, reload } = useOrders('contractor');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [requests, setRequests] = useState<RepairRequest[]>([]);

  useEffect(() => {
    repairApi.received().then((res) => setRequests(res.data.data || [])).catch(() => undefined);
  }, []);

  const kpis = useMemo(
    () => [
      { key: 'new' as const, label: t('orders.kpi.new'), value: items.filter((o) => o.status === 'QUOTATION_ACCEPTED').length },
      { key: 'processing' as const, label: t('orders.kpi.processing'), value: items.filter((o) => o.status === 'DEPOSIT_PAID').length },
      { key: 'in_progress' as const, label: t('orders.kpi.progress'), value: items.filter((o) => o.status === 'STARTED' || o.status === 'IN_PROGRESS').length },
      { key: 'waiting' as const, label: t('orders.kpi.waiting'), value: items.filter((o) => o.status === 'COMPLETED').length },
      { key: 'completed' as const, label: t('orders.kpi.done'), value: items.filter((o) => o.status === 'CUSTOMER_ACCEPTED').length },
    ],
    [items, t]
  );

  const rows = useMemo(() => {
    if (filter === 'new') return items.filter((o) => o.status === 'QUOTATION_ACCEPTED');
    if (filter === 'processing') return items.filter((o) => o.status === 'DEPOSIT_PAID');
    return items.filter((o) => matchesOrderFilter(o.status, filter));
  }, [items, filter]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('orders.contractorEyebrow')} title={t('orders.contractorTitle')} description={t('orders.contractorDesc')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((card) => (
          <button key={card.key} type="button" onClick={() => setFilter(card.key === 'new' ? 'new' : card.key)}>
            <Card className={cn('h-full text-left', filter === card.key && 'ring-2 ring-copper-400')}>
              <p className="text-sm text-ink-400">{card.label}</p>
              <p className="mt-2 font-display text-3xl text-navy-800">{card.value}</p>
            </Card>
          </button>
        ))}
      </div>
      <button type="button" className="mb-4 text-sm font-semibold text-copper-600" onClick={() => setFilter('all')}>
        {t('orders.filter.all')}
      </button>
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={t('orders.contractorEmpty')} body={t('orders.contractorEmptyBody')} />
      ) : (
        <div className="space-y-4">
          {rows.map((order) => {
            const request = requests.find((row) => String(row.id) === String(order.requestId));
            return (
              <OrderCard
                key={order.id}
                order={order}
                to={`/contractor/orders/${order.id}`}
                partyLabel={request?.customer?.name}
              />
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
