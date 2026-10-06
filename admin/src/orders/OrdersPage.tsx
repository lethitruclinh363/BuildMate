import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { loadAdminDirectory } from '@/hooks/useDirectory';
import { Badge } from '@/components/Badge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { formatDate, orderStatusLabel, paymentStatusLabel, vnd } from '@/lib/utils';
import { useReturnState } from '@/lib/navigation';

export function OrdersPage() {
  const { t } = useTranslation();
  const back = useReturnState();
  const { data, loading, error, reload } = useAsync(loadAdminDirectory, []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow={t('pages.jobs')}
        title={t('pages.orders')}
        description={t('pages.ordersDesc')}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('pages.totalAnalytics')} value={data.analytics.orders.total} />
        <StatCard label={t('pages.completed')} value={data.analytics.orders.completed} />
        <StatCard label={t('pages.cancelled')} value={data.analytics.orders.cancelled} />
      </div>
      <DataTable
        columns={[t('pages.code'), t('pages.title'), t('pages.amount'), t('pages.status'), t('pages.payment'), t('pages.created'), '']}
        empty={<EmptyState icon={<ClipboardList className="h-5 w-5" />} title={t('pages.noOrderIds')} />}
        rows={data.orders.map((order) => [
          order.orderCode,
          order.title,
          vnd(order.amount),
          <Badge key={`${order.id}-s`}>{orderStatusLabel(order.status)}</Badge>,
          <Badge key={`${order.id}-p`} tone={order.paymentStatus === 'PAID' ? 'success' : 'warn'}>
            {paymentStatusLabel(order.paymentStatus)}
          </Badge>,
          formatDate(order.createdAt),
          <Link key={`${order.id}-l`} to={`/orders/${order.id}`} state={back} className="text-copper-300">
            {t('pages.view')}
          </Link>,
        ])}
      />
    </div>
  );
}
