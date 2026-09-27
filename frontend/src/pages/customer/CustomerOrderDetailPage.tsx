import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OrderDetailView } from '@/features/orders/components/OrderDetail';
import { useOrderDetail } from '@/features/orders/hooks/useOrderDetail';
import { orderApi } from '@/features/orders/services/order.api';
import { canCancelOrder } from '@/features/orders/types/orderStatus';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

export function CustomerOrderDetailPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const { order, progress, request, quotation, loading, error, reload } = useOrderDetail(id);
  const push = useToastStore((s) => s.push);
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={reload} />;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      push({ kind: 'success', title: success });
      reload();
    } catch (err) {
      push({ kind: 'error', title: te(getApiErrorMessage(err)) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <PageTransition>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/customer/orders">{t('common.back')}</Link>
      </Button>
      <OrderDetailView
        order={order}
        progress={progress}
        request={request}
        quotation={quotation}
        customerView
        actions={
          <Card hover={false} className="space-y-2">
            {request?.roomId ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/customer/chat/${request.roomId}`}>{t('quote.backChat')}</Link>
              </Button>
            ) : null}
            {order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' ? (
              <Button asChild className="w-full">
                <Link to={`/customer/payment/${order.id}`}>{t('pay.cta')}</Link>
              </Button>
            ) : null}
            {order.status === 'CUSTOMER_ACCEPTED' ? (
              <Button asChild variant="copper" className="w-full">
                <Link to={`/customer/orders/${order.id}/review`}>{t('review.write')}</Link>
              </Button>
            ) : null}
            {order.status !== 'CANCELLED' ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/customer/orders/${order.id}/complaint`}>{t('complaint.open')}</Link>
              </Button>
            ) : null}
            {order.status === 'COMPLETED' ? (
              <Button className="w-full" variant="copper" onClick={() => setConfirm('complete')}>
                {t('orders.complete.cta')}
              </Button>
            ) : null}
            {canCancelOrder(order.status) ? (
              <Button variant="outline" className="w-full border-red-200 text-red-700" onClick={() => setConfirm('cancel')}>
                {t('orders.cancel.cta')}
              </Button>
            ) : null}
          </Card>
        }
      />
      <ConfirmModal
        open={confirm === 'complete'}
        title={t('orders.complete.title')}
        description={
          order.paymentStatus === 'PAID' ? t('orders.complete.body') : `${t('orders.complete.body')} ${t('orders.complete.unpaidHint')}`
        }
        busy={busy}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={() => void run(() => orderApi.complete(order.id), t('orders.complete.done'))}
      />
      <ConfirmModal
        open={confirm === 'cancel'}
        title={t('orders.cancel.title')}
        description={t('orders.cancel.body')}
        tone="danger"
        busy={busy}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={() => void run(() => orderApi.cancel(order.id, 'Customer cancelled'), t('orders.cancel.done'))}
      />
    </PageTransition>
  );
}
