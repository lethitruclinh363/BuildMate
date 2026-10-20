import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { BackButton } from '@/components/navigation/BackButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SiteLocationCard } from '@/features/map/components/SiteLocationCard';
import { placeFromRecord } from '@/features/map/lib/location';
import { useMaterialOrderLiveStore } from '@/features/material-orders/material-order-live';
import { getApiErrorMessage } from '@/lib/api';
import { isLegacyMaterialOrder, materialStoreOrderApi, nextStoreStatus, type MaterialOrder } from '@/lib/material-order-api';
import { mediaUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

function when(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return date.toLocaleString(english ? 'en-US' : 'vi-VN');
}

export function StoreOrderDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const tick = useMaterialOrderLiveStore((state) => state.tick);
  const pushToast = useToastStore((state) => state.push);
  const [order, setOrder] = useState<MaterialOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await materialStoreOrderApi.get(id);
        setOrder(res.data.data);
        setError('');
      } catch (err) {
        if (!silent) {
          setOrder(null);
          setError(getApiErrorMessage(err));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!tick) return;
    void load(true);
  }, [tick, load]);

  const next = order ? nextStoreStatus(order.status) : null;

  async function advance() {
    if (!next) return;
    setBusy(true);
    try {
      const res = await materialStoreOrderApi.updateStatus(id, next);
      setOrder(res.data.data);
      pushToast({ kind: 'success', title: t('materialOrder.updated') });
    } catch (err) {
      pushToast({ kind: 'error', title: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={() => void load(false)} />;

  const delivery = placeFromRecord(order);
  const legacy = isLegacyMaterialOrder(order);

  return (
    <PageTransition>
      <BackButton fallback="/store/orders" />
      <PageHeader
        eyebrow={order.orderCode}
        title={t(`materialOrder.status.${order.status}`)}
        description={when(order.createdAt)}
      />
      <div className="grid gap-4">
        <Card hover={false}>
          <p className="text-sm text-ink-500">{t('materialOrder.customer')}</p>
          <p className="font-semibold text-navy-800">{order.customer?.name || '—'}</p>
          <p className="mt-3 text-sm text-ink-500">{t('materialOrder.address')}</p>
          <p className="text-navy-800">{order.deliveryAddress}</p>
          {delivery ? (
            <div className="mt-4">
              <SiteLocationCard title={t('materialOrder.deliveryPlace')} place={delivery} />
            </div>
          ) : null}
          <p className="mt-3 text-sm text-ink-500">{t('materialOrder.distance')}</p>
          <p className="text-navy-800">{t('cart.distanceKm', { n: order.distanceKm })}</p>
          {order.customerNote ? <p className="mt-3 text-sm text-ink-600">{order.customerNote}</p> : null}
        </Card>
        <Card hover={false}>
          <ul className="divide-y divide-navy-800/8">
            {order.items.map((item) => (
              <li key={String(item.materialId)} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-3">
                  {item.imageSnapshot ? (
                    <img src={mediaUrl(item.imageSnapshot)} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 rounded-xl object-cover" />
                  ) : null}
                  <span>
                    <span className="font-medium text-navy-800">{item.nameSnapshot}</span>
                    <span className="mt-1 block text-ink-400">
                      {vnd(item.priceSnapshot)} / {item.unitSnapshot} · × {item.quantity}
                    </span>
                  </span>
                </span>
                <span className="font-semibold text-navy-800">{vnd(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.materialSubtotal')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.materialSubtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.shipping')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.shippingFee)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.total')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.totalAmount)}</dd>
            </div>
            {legacy ? (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('materialOrder.deposit', { rate: order.depositRateSnapshot })}</dt>
                  <dd className="font-semibold text-navy-800">{vnd(order.depositAmount)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('materialOrder.platformFee', { rate: order.platformFeeRateSnapshot })}</dt>
                  <dd className="font-semibold text-navy-800">{vnd(order.platformFeeAmount)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('materialOrder.remaining')}</dt>
                  <dd className="font-semibold text-navy-800">{vnd(order.remainingAmount)}</dd>
                </div>
              </>
            ) : (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">{t(`materialOrder.payment.${order.paymentStatus}`)}</dt>
                <dd className="font-semibold text-navy-800">COD</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-sm text-ink-600">
            {t('materialOrder.directRemaining', { amount: vnd(legacy ? order.remainingAmount : order.totalAmount) })}
          </p>
          {order.remainingSettledOffline ? <p className="mt-2 text-sm text-ink-500">{t('materialOrder.settled')}</p> : null}
          {!order.remainingSettledOffline && ['DELIVERED', 'CUSTOMER_RECEIVED', 'COMPLETED'].includes(order.status) ? (
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void materialStoreOrderApi
                  .collectPayment(id)
                  .then((res) => {
                    setOrder(res.data.data);
                    pushToast({ kind: 'success', title: t('materialOrder.collected') });
                  })
                  .catch((err) => pushToast({ kind: 'error', title: getApiErrorMessage(err) }))
                  .finally(() => setBusy(false));
              }}
            >
              {t('materialOrder.collectPayment')}
            </Button>
          ) : null}
          {next ? (
            <Button className="mt-4" variant="copper" disabled={busy} onClick={() => setConfirm(true)}>
              {t(`materialOrder.action.${next}`)}
            </Button>
          ) : null}
        </Card>
        <Card hover={false}>
          <h2 className="font-display text-2xl text-navy-800">{t('materialOrder.timeline')}</h2>
          <ol className="mt-4 space-y-3">
            {(order.statusHistory || []).map((entry, index) => (
              <li key={`${entry.status}-${entry.createdAt || index}`} className="text-sm">
                <p className="font-semibold text-navy-800">{t(`materialOrder.status.${entry.status}`)}</p>
                <p className="text-ink-400">{when(entry.createdAt)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <ConfirmModal
        open={confirm}
        title={next ? t(`materialOrder.action.${next}`) : ''}
        busy={busy}
        onOpenChange={setConfirm}
        onConfirm={() => void advance()}
        confirmLabel={next ? t(`materialOrder.action.${next}`) : ''}
      />
    </PageTransition>
  );
}
