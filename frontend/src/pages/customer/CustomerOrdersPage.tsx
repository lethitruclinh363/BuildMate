import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { useI18n } from '@/locales';
import { OrderCard } from '@/features/orders/components/OrderCard';
import { useOrders } from '@/features/orders/hooks/useOrders';
import type { OrderFilter } from '@/features/orders/types/order.types';
import { matchesOrderFilter } from '@/features/orders/types/orderStatus';
import type { RepairRequest } from '@/types/sprint4';

const FILTERS: OrderFilter[] = ['all', 'processing', 'in_progress', 'waiting', 'completed', 'cancelled'];

export function CustomerOrdersPage() {
  const { t } = useI18n();
  const { items, loading, error, reload } = useOrders('customer');
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [requests, setRequests] = useState<RepairRequest[]>([]);
  const rows = useMemo(() => items.filter((row) => matchesOrderFilter(row.status, filter)), [items, filter]);

  useEffect(() => {
    repairApi.mine().then((res) => setRequests(res.data.data || [])).catch(() => undefined);
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('orders.listEyebrow')} title={t('orders.listTitle')} description={t('orders.listDesc')} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((code) => (
          <Button
            key={code}
            size="sm"
            variant={filter === code ? 'primary' : 'outline'}
            className={cn('shrink-0', filter === code ? '' : 'bg-white')}
            onClick={() => setFilter(code)}
          >
            {t(`orders.filter.${code}`)}
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={t('orders.emptyTitle')} body={t('orders.emptyBody')} />
      ) : (
        <div className="space-y-4">
          {rows.map((order) => {
            const request = requests.find((row) => String(row.id) === String(order.requestId));
            return (
              <OrderCard
                key={order.id}
                order={order}
                to={`/customer/orders/${order.id}`}
                partyLabel={request?.contractor?.name}
                customerView
              />
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
