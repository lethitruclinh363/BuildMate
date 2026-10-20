import { useParams } from 'react-router-dom';
import { AdminBackButton } from '@/components/AdminBackButton';
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
    if (!window.confirm(`${t('pages.mockWarning')}\n\n${t('pages.confirmRefund')}`)) return;
    setBusy(true);
    try {
      await adminApi.refundPayment(paymentId, reason);
      push('success', t('pages.mockRefundPosted'));
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!window.confirm(`${t('pages.mockWarning')}\n\n${t('pages.confirmPayout')}`)) return;
    setBusy(true);
    try {
      await adminApi.settleEscrow(id);
      push('success', t('pages.mockPayoutPosted'));
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
      <AdminBackButton fallback="/orders" label={t('pages.orders')} />
      <PageHeader
        eyebrow={order.orderCode}
        title={order.title}
        description={order.description}
        actions={<Badge tone={order.status === 'COMPLETED' ? 'success' : 'copper'}>{orderStatusLabel(order.status)}</Badge>}
      />
      <GlassCard className="space-y-2 text-sm text-white/70">
        <p>{t('pages.amount')}: {vnd(order.amount)}</p>
        <p>
          {t('pages.payment')}:{' '}
          {order.isMaterialOrder
            ? `COD (Thanh toán khi nhận hàng) · ${paymentStatusLabel(order.paymentStatus)}`
            : paymentStatusLabel(order.paymentStatus)}
        </p>
        <p>
          {t('pages.customer')}:{' '}
          {order.customerName ? `${order.customerName} (${order.customerId})` : order.customerId}
        </p>
        <p>
          {order.isMaterialOrder ? 'Cửa hàng (Store):' : t('pages.contractor')}:{' '}
          {order.storeName ? `${order.storeName} (${order.storeId || order.contractorId})` : order.contractorId}
        </p>
        {order.deliveryAddress ? <p>Địa chỉ nhận hàng: {order.deliveryAddress}</p> : null}
        <p>{t('pages.created')}: {formatDate(order.createdAt)}</p>
        {order.completedAt ? <p>{t('pages.completedAt')}: {formatDate(order.completedAt)}</p> : null}
        {payments.summary.escrowStatus ? (
          <p>{t('pages.escrowStatus')}: {payments.summary.escrowStatus}</p>
        ) : null}
        {!order.isMaterialOrder && (
          <Button className="mt-3" loading={busy} onClick={() => void settle()}>
            {t('pages.payout10')}
          </Button>
        )}
        {order.statusHistory && order.statusHistory.length > 0 ? (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="font-semibold text-white/90 mb-2">Lịch sử trạng thái (Status History):</p>
            <ul className="space-y-1 text-xs text-white/60">
              {order.statusHistory.map((h, idx) => (
                <li key={idx} className="flex flex-wrap gap-2">
                  <span className="font-medium text-copper-300">{orderStatusLabel(h.status)}</span>
                  {h.actorRole ? <span className="text-white/40">[{h.actorRole}]</span> : null}
                  <span>· {formatDate(h.createdAt || '')}</span>
                  {h.note ? <span className="text-white/50">({h.note})</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </GlassCard>
      <GlassCard className="mt-6">
        <p className="mb-4 text-xs uppercase tracking-[0.16em] text-copper-400">{t('pages.payments')}</p>
        {order.isMaterialOrder ? (
          <div className="rounded-xl border border-white/8 bg-white/5 p-4 text-sm text-white/70">
            <p className="font-medium text-white/90">Thanh toán COD (Thanh toán trực tiếp)</p>
            <p className="mt-1 text-xs text-white/50">
              Khách thanh toán trực tiếp cho cửa hàng khi nhận hàng. BuildMate không thu cọc 15%, không giữ Escrow và không thu phí nền tảng.
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2">
              <span>Trạng thái thu tiền:</span>
              <Badge tone={order.paymentStatus === 'PAID' ? 'success' : 'warn'}>
                {order.paymentStatus === 'PAID' ? 'Đã thu tiền COD' : 'Chưa thu tiền COD'}
              </Badge>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </GlassCard>
    </div>
  );
}
