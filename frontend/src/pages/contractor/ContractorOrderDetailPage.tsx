import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { BackButton } from '@/components/navigation/BackButton';
import { Button } from '@/components/ui/Button';
import { useReturnState } from '@/lib/navigation';
import { Card } from '@/components/ui/Card';
import { OrderDetailView } from '@/features/orders/components/OrderDetail';
import { useOrderDetail } from '@/features/orders/hooks/useOrderDetail';
import { orderApi } from '@/features/orders/services/order.api';
import { allowedProgressStatuses, canCancelOrder } from '@/features/orders/types/orderStatus';
import type { OrderStatus } from '@/features/orders/types/order.types';
import { ProgressUpdateForm } from '@/features/progress/components/ProgressUpdateForm';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const READY_TO_START: OrderStatus[] = ['DEPOSIT_PAID'];

export function ContractorOrderDetailPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const back = useReturnState();
  const { order, progress, request, quotation, loading, error, reload, noteProgress } = useOrderDetail(id);
  const push = useToastStore((s) => s.push);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={reload} />;

  const progressChoices = allowedProgressStatuses(order.status);

  return (
    <PageTransition>
      <BackButton fallback="/contractor/orders" />
      <OrderDetailView
        order={order}
        progress={progress}
        request={request}
        quotation={quotation}
        actions={
          <Card hover={false} className="space-y-3">
            {request?.roomId ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/contractor/chat/${request.roomId}`} state={back}>{t('quote.backChat')}</Link>
              </Button>
            ) : null}
            {order.status === 'QUOTATION_ACCEPTED' ? (
              <p className="text-sm text-ink-500">{t('materialOrder.waitDeposit')}</p>
            ) : null}
            {order.status === 'DEPOSIT_PAID' || order.status === 'STARTED' || order.status === 'IN_PROGRESS' ? (
              <p className="text-sm text-ink-500">{t('materialOrder.escrowHeld')}</p>
            ) : null}
            {order.status === 'COMPLETED' || order.status === 'CUSTOMER_ACCEPTED' ? (
              <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void orderApi
                    .confirmRemaining(order.id)
                    .then(() => {
                      push({ kind: 'success', title: t('materialOrder.remainingConfirmed') });
                      reload();
                    })
                    .catch((err) => push({ kind: 'error', title: te(getApiErrorMessage(err)) }))
                    .finally(() => setBusy(false));
                }}
              >
                {t('materialOrder.confirmRemaining')}
              </Button>
            ) : null}
            {READY_TO_START.includes(order.status) ? (
              <Button
                className="w-full"
                variant="copper"
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  void orderApi
                    .addProgress(order.id, { status: 'STARTED', description: t('orders.progress.acceptNote') })
                    .then((res) => {
                      noteProgress(res.data.data);
                      push({ kind: 'success', title: t('orders.progress.accepted') });
                      reload();
                    })
                    .catch((err) => push({ kind: 'error', title: te(getApiErrorMessage(err)) }))
                    .finally(() => setBusy(false));
                }}
              >
                {t('orders.progress.accept')}
              </Button>
            ) : null}
            {progressChoices.length ? (
              <ProgressUpdateForm
                currentStatus={order.status}
                busy={busy}
                onSubmit={async (payload) => {
                  setBusy(true);
                  try {
                    const res = await orderApi.addProgress(order.id, payload);
                    noteProgress(res.data.data);
                    push({ kind: 'success', title: t('orders.progress.saved') });
                    reload();
                  } catch (err) {
                    push({ kind: 'error', title: te(getApiErrorMessage(err)) });
                    throw err;
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
            {canCancelOrder(order.status) ? (
              <Button variant="outline" className="w-full border-red-200 text-red-700" onClick={() => setCancelOpen(true)}>
                {t('orders.cancel.cta')}
              </Button>
            ) : null}
          </Card>
        }
      />
      <ConfirmModal
        open={cancelOpen}
        title={t('orders.cancel.title')}
        description={t('orders.cancel.body')}
        tone="danger"
        busy={busy}
        onOpenChange={setCancelOpen}
        onConfirm={() => {
          setBusy(true);
          void orderApi
            .cancel(order.id, 'Contractor cancelled')
            .then(() => {
              push({ kind: 'success', title: t('orders.cancel.done') });
              reload();
            })
            .catch((err) => push({ kind: 'error', title: te(getApiErrorMessage(err)) }))
            .finally(() => {
              setBusy(false);
              setCancelOpen(false);
            });
        }}
      />
    </PageTransition>
  );
}
