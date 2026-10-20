import { useTranslation } from 'react-i18next';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { vnd } from '@/lib/utils';

function MixBars({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs text-white/50">
            <span>{item.label}</span>
            <span>{typeof item.value === 'number' && item.value > 1000 ? vnd(item.value) : item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-copper-500" style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => adminApi.analytics(), []);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const openOrders = Math.max(data.orders.total - data.orders.completed - data.orders.cancelled, 0);
  const ledger = data.finance.ledger;

  return (
    <div>
      <PageHeader eyebrow={t('pages.insights')} title={t('pages.analytics')} description={t('pages.analyticsDesc')} />
      {ledger ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label={t('pages.ledgerA')} value={vnd(ledger.acceptedQuoteTotal)} />
          <StatCard label={t('pages.ledgerB')} value={vnd(ledger.capturedDeposit)} />
          <StatCard label={t('pages.ledgerC')} value={vnd(ledger.heldAmount)} />
          <StatCard label={t('pages.ledgerD')} value={vnd(ledger.disputedAmount)} />
          <StatCard label={t('pages.ledgerE')} value={vnd(ledger.refundPendingAmount)} />
          <StatCard label={t('pages.ledgerF')} value={vnd(ledger.refundedAmount)} />
          <StatCard label={t('pages.ledgerG')} value={vnd(ledger.payoutPendingAmount)} />
          <StatCard label={t('pages.ledgerH')} value={vnd(ledger.paidOutAmount)} />
          <StatCard label={t('pages.ledgerI')} value={vnd(ledger.platformFeePosted)} />
          <StatCard label={t('pages.ledgerJ')} value={vnd(ledger.materialGmv)} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('pages.users')} value={data.users.total} />
        <StatCard label={t('pages.customers')} value={data.users.customer} />
        <StatCard label={t('pages.contractors')} value={data.users.contractor} />
        <StatCard label={t('pages.orders')} value={data.orders.total} />
        <StatCard label={t('pages.completed')} value={data.orders.completed} />
        <StatCard label={t('pages.cancelled')} value={data.orders.cancelled} />
        <StatCard label={t('pages.commission')} value={vnd(data.finance.commission)} />
        <StatCard label={t('pages.gmv')} value={vnd(data.finance.capturedDeposits || 0)} />
        <StatCard label={t('pages.materialGmv')} value={vnd(data.finance.materialGmv || 0)} />
        <StatCard label={t('pages.earning')} value={vnd(data.finance.contractorEarning)} />
        <StatCard label={t('pages.rating')} value={data.reviews.average.toFixed(1)} />
        <StatCard label={t('pages.openComplaints')} value={data.complaints.open} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-copper-400">{t('pages.financeMix')}</p>
          <MixBars
            items={[
              { label: t('pages.ledgerI'), value: ledger?.platformFeePosted || data.finance.commission },
              { label: t('pages.ledgerB'), value: ledger?.capturedDeposit || data.finance.capturedDeposits || 0 },
              { label: t('pages.ledgerJ'), value: ledger?.materialGmv || data.finance.materialGmv || 0 },
              { label: t('pages.ledgerH'), value: ledger?.paidOutAmount || 0 },
            ]}
          />
        </GlassCard>
        <GlassCard>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-copper-400">{t('pages.orderMix')}</p>
          <MixBars
            items={[
              { label: t('pages.completed'), value: data.orders.completed },
              { label: t('pages.cancelled'), value: data.orders.cancelled },
              { label: t('pages.open'), value: openOrders },
            ]}
          />
        </GlassCard>
      </div>
    </div>
  );
}
