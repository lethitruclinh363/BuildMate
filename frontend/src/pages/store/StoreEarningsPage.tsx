import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { useMaterialOrderLiveStore } from '@/features/material-orders/material-order-live';
import { getApiErrorMessage } from '@/lib/api';
import { materialStoreOrderApi, type MaterialEarnings } from '@/lib/material-order-api';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';

const ROWS = ['orderValue', 'onlineDeposits', 'platformFees', 'storeDeposits', 'directRemaining'] as const;

export function StoreEarningsPage() {
  const { t } = useI18n();
  const tick = useMaterialOrderLiveStore((state) => state.tick);
  const [data, setData] = useState<MaterialEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    materialStoreOrderApi
      .earnings()
      .then((res) => {
        if (!ignore) {
          setData(res.data.data);
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

  if (loading) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={() => window.location.reload()} />;

  const labels: Record<(typeof ROWS)[number], string> = {
    orderValue: t('materialOrder.orderValue'),
    onlineDeposits: t('materialOrder.onlineDeposits'),
    platformFees: t('materialOrder.platformFees'),
    storeDeposits: t('materialOrder.storeDeposits'),
    directRemaining: t('materialOrder.directRemainingTotal'),
  };

  return (
    <PageTransition>
      <PageHeader eyebrow={t('nav.store.earnings')} title={t('materialOrder.earningsTitle')} description={t('materialOrder.earningsBody')} />
      <div className="grid gap-3 md:grid-cols-2">
        {ROWS.map((key) => (
          <Card key={key} hover={false} className="p-4">
            <p className="text-sm text-ink-500">{labels[key]}</p>
            <p className="mt-1 text-2xl font-semibold text-navy-800">{vnd(data[key])}</p>
          </Card>
        ))}
      </div>
    </PageTransition>
  );
}
