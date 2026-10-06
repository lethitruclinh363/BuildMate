import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { useMaterialOrderLiveStore } from '@/features/material-orders/material-order-live';
import { getApiErrorMessage } from '@/lib/api';
import { materialOrderApi, type MaterialOrder } from '@/lib/material-order-api';
import { vnd } from '@/lib/partner-api';
import { useReturnState } from '@/lib/navigation';
import { useI18n } from '@/locales';

const FILTERS = ['all', 'DEPOSIT_PAID', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const;

function when(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return date.toLocaleString(english ? 'en-US' : 'vi-VN');
}

export function CustomerMaterialOrdersPage() {
  const { t } = useI18n();
  const back = useReturnState();
  const tick = useMaterialOrderLiveStore((state) => state.tick);
  const [rows, setRows] = useState<MaterialOrder[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    materialOrderApi
      .mine()
      .then((res) => {
        if (!ignore) {
          setRows(res.data.data || []);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!ignore) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [tick]);

  const visible = useMemo(
    () => rows.filter((row) => filter === 'all' || row.status === filter),
    [rows, filter]
  );

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={() => window.location.reload()} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('materialOrder.eyebrow')} title={t('materialOrder.listTitle')} description={t('materialOrder.listBody')} />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((code) => (
          <Button key={code} size="sm" variant={filter === code ? 'primary' : 'outline'} onClick={() => setFilter(code)}>
            {t(`materialOrder.filters.${code}`)}
          </Button>
        ))}
      </div>
      {!visible.length ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title={rows.length ? t('materialOrder.emptyFilter') : t('materialPage.ordersEmpty')}
          body={t('materialOrder.listBody')}
        />
      ) : (
        <div className="divide-y divide-navy-800/10 overflow-hidden rounded-xl border border-navy-800/10 bg-white">
          {visible.map((order) => (
            <Link key={order.id} to={`/customer/material-orders/${order.id}`} state={back} className="block px-4 py-4 hover:bg-paper-100">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-navy-800">{order.orderCode}</p>
                    <p className="mt-1 text-sm text-ink-500">{order.storeName}</p>
                    <p className="text-xs text-ink-400">{when(order.createdAt)}</p>
                  </div>
                  <p className="text-sm font-semibold text-navy-800">{t(`materialOrder.status.${order.status}`)}</p>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-ink-400">{t('materialOrder.total')}</dt>
                    <dd className="font-semibold text-navy-800">{vnd(order.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">{t('materialOrder.deposit', { rate: order.depositRateSnapshot })}</dt>
                    <dd className="font-semibold text-navy-800">{vnd(order.depositAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">{t('materialOrder.remaining')}</dt>
                    <dd className="font-semibold text-navy-800">{vnd(order.remainingAmount)}</dd>
                  </div>
                </dl>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
