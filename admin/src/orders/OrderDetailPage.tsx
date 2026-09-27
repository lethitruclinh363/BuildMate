import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { TextArea } from '@/components/Input';
import { formatDate, orderStatusLabel, paymentStatusLabel, vnd } from '@/lib/utils';
import { getApiErrorMessage } from '@/services/api';
import { useToastStore } from '@/stores/toast.store';

export function OrderDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const push = useToastStore((s) => s.push);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(async () => {
    const [order, payments] = await Promise.all([adminApi.getOrder(id), adminApi.getOrderPayments(id)]);
    return { order, payments };
  }, [id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  const refund = async (paymentId: string) => {
    setBusy(true);
    try {
      await adminApi.refundPayment(paymentId, reason);
      push('success', t('pages.refunded'));
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const { order, payments } = data;

  return (
    <div>
      <Link to="/orders" className="mb-4 inline-block text-sm text-copper-300">
        ← {t('pages.orders')}
      </Link>
      <PageHeader
        eyebrow={order.orderCode}
        title={order.title}
        description={order.description}
        actions={<Badge tone={order.status === 'COMPLETED' ? 'success' : 'copper'}>{orderStatusLabel(order.status)}</Badge>}
      />
      <GlassCard className="space-y-2 text-sm text-white/70">
        <p>{t('pages.amount')}: {vnd(order.amount)}</p>
        <p>{t('pages.payment')}: {paymentStatusLabel(order.paymentStatus)}</p>
        <p>{t('pages.customer')}: {order.customerId}</p>
        <p>{t('pages.contractor')}: {order.contractorId}</p>
        <p>{t('pages.created')}: {formatDate(order.createdAt)}</p>
        <p>{t('pages.completedAt')}: {formatDate(order.completedAt)}</p>
      </GlassCard>
      <GlassCard className="mt-6">
        <p className="mb-4 text-xs uppercase tracking-[0.16em] text-copper-400">{t('pages.payments')}</p>
        <p className="mb-4 text-sm text-white/60">
          {t('pages.paidOf', { paid: vnd(payments.summary.paidAmount), total: vnd(payments.summary.amount) })}
        </p>
        <TextArea label={t('pages.refundReason')} value={reason} onChange={setReason} />
        <div className="mt-4 space-y-3">
          {payments.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 px-4 py-3">
              <div>
                <p className="text-sm">{item.type} · {vnd(item.amount)}</p>
                <p className="text-xs text-white/40">{paymentStatusLabel(item.status)} · {item.transactionCode || t('pages.noTxn')}</p>
              </div>
              {item.status === 'PAID' ? (
                <Button variant="danger" loading={busy} onClick={() => void refund(item.id)}>
                  {t('pages.refund')}
                </Button>
              ) : (
                <Badge>{paymentStatusLabel(item.status)}</Badge>
              )}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
