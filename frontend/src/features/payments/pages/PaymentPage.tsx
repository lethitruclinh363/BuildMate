import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useOrderDetail } from '@/features/orders/hooks/useOrderDetail';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import { useOrderPayments } from '../hooks/useOrderPayments';
import { paymentApi } from '../services/payment.api';
import { canCheckout } from '../types/paymentStatus';
import { PaymentSummaryCard } from '../components/PaymentSummaryCard';

export function PaymentPage() {
  const { orderId } = useParams();
  const { t, te } = useI18n();
  const { order, request, loading: orderLoading, error: orderError, reload: reloadOrder } = useOrderDetail(orderId);
  const { data, loading, error, reload } = useOrderPayments(orderId);
  const push = useToastStore((s) => s.push);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (orderLoading || loading) return <DashboardSkeleton />;
  if (orderError || error || !order || !data) {
    return <ErrorState body={orderError || error || t('pay.empty')} onRetry={() => { reloadOrder(); reload(); }} />;
  }

  const payable = data.items.find((row) => canCheckout(row.status)) || data.items.find((row) => row.status === 'PENDING');
  const paid = data.summary.status === 'PAID';

  const pay = async () => {
    if (!payable) return;
    setBusy(true);
    try {
      let id = payable.id;
      if (canCheckout(payable.status)) {
        const res = await paymentApi.checkout(payable.id);
        id = res.data.data.payment.id;
      }
      if (import.meta.env.DEV || import.meta.env.MODE !== 'production') {
        await paymentApi.mockSuccess(id);
      }
      push({ kind: 'success', title: t('pay.success') });
      reload();
      reloadOrder();
    } catch (err) {
      push({ kind: 'error', title: te(getApiErrorMessage(err)) });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <PageTransition>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to={`/customer/orders/${order.id}`}>{t('common.back')}</Link>
      </Button>
      <PageHeader eyebrow={t('pay.eyebrow')} title={t('pay.title')} description={t('pay.desc')} />
      <div className="space-y-6">
        <PaymentSummaryCard
          summary={data.summary}
          orderCode={order.orderCode || ''}
          title={order.title}
          contractor={request?.contractor?.name}
        />
        <Card hover={false}>
          {paid ? (
            <p className="text-sm text-ink-600">{t('pay.paidHint')}</p>
          ) : (
            <Button variant="copper" onClick={() => setOpen(true)} disabled={!payable}>
              {t('pay.cta')}
            </Button>
          )}
        </Card>
      </div>
      <ConfirmModal
        open={open}
        title={t('pay.confirmTitle')}
        description={t('pay.confirmBody')}
        busy={busy}
        onOpenChange={(v) => !v && setOpen(false)}
        onConfirm={() => void pay()}
        confirmLabel={t('pay.cta')}
      />
    </PageTransition>
  );
}
