import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { vnd } from '@/lib/utils';
import { getApiErrorMessage } from '@/services/api';
import { useToastStore } from '@/stores/toast.store';

export function EscrowPage() {
  const { t } = useTranslation();
  const push = useToastStore((s) => s.push);
  const { data, loading, error, reload } = useAsync(async () => {
    const [ledger, rows] = await Promise.all([adminApi.financeSummary(), adminApi.listEscrows()]);
    return { ledger, rows };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const { ledger, rows } = data;

  const confirmMock = (message: string) => window.confirm(`${t('pages.mockWarning')}\n\n${message}`);

  const payout = async (orderId: string) => {
    if (!confirmMock(t('pages.confirmPayout'))) return;
    setBusy(`payout-${orderId}`);
    try {
      await adminApi.settleEscrow(orderId);
      push('success', t('pages.mockPayoutPosted'));
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const refund = async (orderId: string) => {
    if (!confirmMock(t('pages.confirmRefund'))) return;
    setBusy(`refund-${orderId}`);
    try {
      await adminApi.refundEscrow(orderId, t('pages.adminRefund'));
      push('success', t('pages.mockRefundPosted'));
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader eyebrow={t('pages.finance')} title={t('pages.escrowTitle')} description={t('pages.escrowDesc')} />
      <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-sm">
        <span className="text-base leading-none text-amber-600" aria-hidden="true">⚠️</span>
        <span>{t('pages.mockWarning')}</span>
      </div>
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
      <DataTable
        columns={[
          t('pages.code'),
          t('pages.amount'),
          t('pages.depositLine'),
          t('pages.escrowStatus'),
          t('pages.payment85'),
          t('pages.status'),
          '',
        ]}
        empty={<EmptyState icon={<Landmark className="h-5 w-5" />} title={t('pages.noEscrow')} />}
        rows={rows.map((row) => [
          <Link key={`${row.orderId}-c`} to={`/orders/${row.orderId}`} className="font-semibold text-[#2B6280] hover:text-[#173B4F] hover:underline">
            {row.orderCode || row.orderId}
          </Link>,
          vnd(row.quoteTotal),
          `${vnd(row.depositAmount)} / ${vnd(row.platformFee)} / ${vnd(row.contractorHold)}`,
          <Badge key={`${row.orderId}-e`} tone={row.escrowStatus === 'HELD' ? 'success' : row.escrowStatus === 'FROZEN' ? 'warn' : 'navy'}>
            {row.escrowStatus}
          </Badge>,
          row.remainingSettled ? t('pages.yes') : t('pages.no'),
          row.workStatus,
          <div key={`${row.orderId}-a`} className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={busy === `payout-${row.orderId}`}
              disabled={!row.actions.canPayout || Boolean(busy)}
              onClick={() => void payout(row.orderId)}
            >
              {t('pages.payout10')}
            </Button>
            <Button
              variant="danger"
              loading={busy === `refund-${row.orderId}`}
              disabled={!row.actions.canRefund || Boolean(busy)}
              onClick={() => void refund(row.orderId)}
            >
              {t('pages.refund')}
            </Button>
          </div>,
        ])}
      />
    </div>
  );
}
