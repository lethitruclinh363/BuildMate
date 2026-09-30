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
import type { OrderStatus } from '@/features/orders/types/order.types';
import { ProgressUpdateForm } from '@/features/progress/components/ProgressUpdateForm';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const OPEN_FOR_PROGRESS: OrderStatus[] = ['QUOTATION_ACCEPTED', 'DEPOSIT_PAID', 'STARTED', 'IN_PROGRESS'];
const READY_TO_START: OrderStatus[] = ['QUOTATION_ACCEPTED', 'DEPOSIT_PAID'];

export function ContractorOrderDetailPage() {
  const { id } = useParams();
  const { t, te } = useI18n();
  const { order, progress, request, quotation, loading, error, reload } = useOrderDetail(id);
  const push = useToastStore((s) => s.push);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={reload} />;

  const canWork = OPEN_FOR_PROGRESS.includes(order.status);

  return (
    <PageTransition>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/contractor/orders">{t('common.back')}</Link>
      </Button>
      <OrderDetailView
        order={order}
        progress={progress}
        request={request}
        quotation={quotation}
        actions={
          <Card hover={false} className="space-y-3">
            {request?.roomId ? (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/contractor/chat/${request.roomId}`}>{t('quote.backChat')}</Link>
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
                    .then(() => {
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
            {canWork ? (
              <ProgressUpdateForm
                busy={busy}
                onSubmit={async (payload) => {
                  setBusy(true);
                  try {
                    await orderApi.addProgress(order.id, payload);
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
