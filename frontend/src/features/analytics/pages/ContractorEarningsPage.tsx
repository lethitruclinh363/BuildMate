import { useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card } from '@/components/ui/Card';
import { MixBars, StatCard } from '@/features/analytics/components/MixBars';
import { useEarnings } from '@/features/analytics/hooks/useEarnings';
import { useOrders } from '@/features/orders/hooks/useOrders';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';

export function ContractorEarningsPage() {
  const { t, locale } = useI18n();
  const { data, loading, error, reload } = useEarnings();
  const { items: orders, loading: ordersLoading } = useOrders('contractor');
  const tag = locale === 'en' ? 'en-US' : 'vi-VN';

  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    (data?.transactions || []).forEach((row) => {
      if (row.status !== 'POSTED') return;
      const key = row.createdAt.slice(0, 7);
      map.set(key, (map.get(key) || 0) + row.contractorAmount);
    });
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [data]);

  const completed = orders.filter((row) => row.status === 'CUSTOMER_ACCEPTED').length;

  if (loading || ordersLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  const rows = data?.transactions || [];

  return (
    <PageTransition>
      <PageHeader eyebrow={t('earn.eyebrow')} title={t('earn.title')} description={t('earn.desc')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('earn.gross')} value={vnd(data?.totalRevenue || 0)} />
        <StatCard label={t('earn.fee')} value={vnd(data?.totalCommission || 0)} />
        <StatCard label={t('earn.net')} value={vnd(data?.netEarning || 0)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card hover={false}>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-copper-500">{t('earn.chartEarn')}</p>
          {monthly.length ? <MixBars items={monthly.map((row) => ({ ...row, tone: 'copper' }))} /> : <p className="text-sm text-ink-400">—</p>}
        </Card>
        <Card hover={false}>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-copper-500">{t('earn.chartJobs')}</p>
          <p className="font-display text-4xl text-navy-800">{completed}</p>
        </Card>
      </div>
      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Wallet className="h-5 w-5" />} title={t('earn.empty')} body={t('earn.emptyBody')} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[22px] border border-navy-800/8 bg-white">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-paper-100 text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3">{t('earn.order')}</th>
                <th className="px-4 py-3">{t('earn.date')}</th>
                <th className="px-4 py-3">{t('earn.grossCol')}</th>
                <th className="px-4 py-3">{t('earn.feeCol')}</th>
                <th className="px-4 py-3">{t('earn.netCol')}</th>
                <th className="px-4 py-3">{t('earn.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const order = orders.find((item) => String(item.id) === String(row.orderId));
                return (
                  <tr key={row.id} className="border-t border-navy-800/8">
                    <td className="px-4 py-3 font-mono text-xs">{order?.orderCode || String(row.orderId).slice(-6)}</td>
                    <td className="px-4 py-3 text-ink-500">{new Date(row.createdAt).toLocaleDateString(tag)}</td>
                    <td className="px-4 py-3">{vnd(row.platformAmount + row.contractorAmount)}</td>
                    <td className="px-4 py-3">{vnd(row.platformAmount)}</td>
                    <td className="px-4 py-3 font-semibold text-navy-800">{vnd(row.contractorAmount)}</td>
                    <td className="px-4 py-3">{row.status === 'REVERSED' ? t('paymentStatus.REFUNDED') : t('paymentStatus.PAID')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageTransition>
  );
}
