import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { useMaterialOrderLiveStore } from '@/features/material-orders/material-order-live';
import { getApiErrorMessage } from '@/lib/api';
import { canStoreCancel, isLegacyMaterialOrder, materialStoreOrderApi } from '@/lib/material-order-api';
import type { MaterialOrder } from '@/lib/material-order-api';
import { vnd } from '@/lib/partner-api';
import { useReturnState } from '@/lib/navigation';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

const FILTERS = ['all', 'PENDING_CONFIRMATION', 'DEPOSIT_PAID', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const;

function when(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return date.toLocaleString(english ? 'en-US' : 'vi-VN');
}

export function StoreOrdersPage() {
  const { t } = useI18n();
  const back = useReturnState();
  const tick = useMaterialOrderLiveStore((state) => state.tick);
  const pushToast = useToastStore((state) => state.push);
  const [rows, setRows] = useState<MaterialOrder[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<MaterialOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    materialStoreOrderApi
      .list()
      .then((res) => {
        if (!ignore) {
          setRows(res.data.data || []);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!ignore) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [tick]);

  const openCancel = useCallback((order: MaterialOrder) => {
    setCancelReason('');
    setCancelTarget(order);
  }, []);

  const closeCancel = useCallback(() => {
    if (busy) return;
    setCancelTarget(null);
  }, [busy]);

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget || busy) return;
    setBusy(true);
    try {
      const res = await materialStoreOrderApi.cancel(cancelTarget.id, cancelReason);
      const updated = res.data.data;
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setCancelTarget(null);
      setCancelReason('');
      pushToast({ kind: 'success', title: t('materialOrder.storeCancelDone') });
    } catch (err) {
      // Giữ modal mở khi API lỗi để cửa hàng đọc thông báo và thử lại.
      pushToast({ kind: 'error', title: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }, [busy, cancelReason, cancelTarget, pushToast, t]);

  const visible = useMemo(
    () => rows.filter((row) => filter === 'all' || row.status === filter),
    [rows, filter]
  );

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={() => window.location.reload()} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('nav.store.orders')} title={t('materialPage.ordersTitle')} description={t('materialOrder.storeListBody')} />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((code) => (
          <Button key={code} size="sm" variant={filter === code ? 'primary' : 'outline'} onClick={() => setFilter(code)}>
            {t(`materialOrder.filters.${code}`)}
          </Button>
        ))}
      </div>
      {!visible.length ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title={rows.length ? t('materialOrder.emptyFilter') : t('materialPage.ordersEmpty')}
          body={t('materialOrder.storeListBody')}
        />
      ) : (
        <div className="divide-y divide-navy-800/10 overflow-hidden rounded-xl border border-navy-800/10 bg-white">
          {visible.map((order) => (
            <div key={order.id} className="grid gap-3 px-4 py-4 hover:bg-paper-100 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
              <Link to={`/store/orders/${order.id}`} state={back} className="grid gap-3 md:col-span-2 md:grid-cols-[1.2fr_1fr] md:items-center">
                <div>
                  <p className="text-base font-semibold text-navy-800">{order.orderCode}</p>
                  <p className="mt-1 text-sm text-ink-500">{order.customer?.name || t('materialOrder.customer')}</p>
                  <p className="text-xs text-ink-400">{when(order.createdAt)}</p>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-ink-400">{t('materialOrder.total')}</dt>
                    <dd className="font-semibold text-navy-800">{vnd(order.totalAmount)}</dd>
                  </div>
                  {isLegacyMaterialOrder(order) ? (
                    <>
                      <div>
                        <dt className="text-ink-400">{t('materialOrder.deposit', { rate: order.depositRateSnapshot })}</dt>
                        <dd className="font-semibold text-navy-800">{vnd(order.depositAmount)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-400">{t('materialOrder.remaining')}</dt>
                        <dd className="font-semibold text-navy-800">{vnd(order.remainingAmount)}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="text-ink-400">{t('materialOrder.shipping')}</dt>
                        <dd className="font-semibold text-navy-800">{vnd(order.shippingFee)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-400">{t(`materialOrder.payment.${order.paymentStatus}`)}</dt>
                        <dd className="font-semibold text-navy-800">COD</dd>
                      </div>
                    </>
                  )}
                </dl>
              </Link>
              <div className="flex items-center gap-3 md:flex-col md:items-end">
                <p className="text-sm font-semibold text-navy-800">{t(`materialOrder.status.${order.status}`)}</p>
                {canStoreCancel(order.status, order.paymentStatus) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => openCancel(order)}
                  >
                    {t('materialOrder.storeCancel')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title={t('materialOrder.storeCancelTitle')}
        description={t('materialOrder.storeCancelBody')}
        confirmLabel={t('materialOrder.storeCancelConfirm')}
        cancelLabel={t('materialOrder.storeCancelBack')}
        tone="danger"
        busy={busy}
        onOpenChange={() => closeCancel()}
        onConfirm={() => void confirmCancel()}
      >
        {cancelTarget ? (
          <>
            <p className="mt-3 text-sm font-semibold text-navy-800">
              {t('materialOrder.storeCancelOrder', { code: cancelTarget.orderCode })}
            </p>
            <div className="mt-3">
              <TextArea
                id="store-material-order-cancel-reason"
                rows={3}
                maxLength={500}
                label={t('materialOrder.storeCancelReason')}
                placeholder={t('materialOrder.storeCancelReasonPlaceholder')}
                value={cancelReason}
                disabled={busy}
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </div>
          </>
        ) : null}
      </ConfirmModal>
    </PageTransition>
  );
}
