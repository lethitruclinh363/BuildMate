import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { loadAdminDirectory } from '@/hooks/useDirectory';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { StatCard } from '@/components/StatCard';
import { TextArea } from '@/components/Input';
import { formatDate, paymentStatusLabel, vnd } from '@/lib/utils';
import { useReturnState } from '@/lib/navigation';
import { getApiErrorMessage } from '@/services/api';
import { useToastStore } from '@/stores/toast.store';

export function PaymentsPage() {
  const { t } = useTranslation();
  const back = useReturnState();
  const { data, loading, error, reload } = useAsync(loadAdminDirectory, []);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const push = useToastStore((s) => s.push);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const refund = async (id: string) => {
    setBusy(true);
    try {
      await adminApi.refundPayment(id, reason || t('pages.adminRefund'));
      push('success', t('pages.refundPosted'));
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('pages.finance')}
        title={t('pages.payments')}
        description={t('pages.paymentsDesc')}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('pages.revenue')} value={vnd(data.analytics.finance.revenue)} />
        <StatCard label={t('pages.paidCount')} value={data.analytics.finance.paidCount} />
        <StatCard label={t('pages.visibleRows')} value={data.payments.length} />
      </div>
      <div className="mb-4 max-w-xl">
        <TextArea label={t('pages.defaultRefund')} value={reason} onChange={setReason} rows={2} />
      </div>
      <DataTable
        columns={[t('pages.amount'), t('pages.type'), t('pages.status'), t('pages.order'), t('pages.paidAt'), '']}
        empty={<EmptyState icon={<CreditCard className="h-5 w-5" />} title={t('pages.noPayments')} />}
        rows={data.payments.map((row) => [
          vnd(row.amount),
          row.type,
          <Badge key={`${row.id}-s`} tone={row.status === 'PAID' ? 'success' : row.status === 'REFUNDED' ? 'warn' : 'navy'}>
            {paymentStatusLabel(row.status)}
          </Badge>,
          <Link key={`${row.id}-o`} to={`/orders/${row.orderId}`} state={back} className="text-copper-300">
            {t('pages.openOrder')}
          </Link>,
          formatDate(row.paidAt),
          row.status === 'PAID' ? (
            <Button key={`${row.id}-r`} variant="danger" loading={busy} onClick={() => void refund(row.id)}>
              {t('pages.refund')}
            </Button>
          ) : (
            '—'
          ),
        ])}
      />
    </div>
  );
}
