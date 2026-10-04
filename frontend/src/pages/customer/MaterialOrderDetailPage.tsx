import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SiteLocationCard } from '@/features/map/components/SiteLocationCard';
import { placeFromRecord } from '@/features/map/lib/location';
import { getApiErrorMessage } from '@/lib/api';
import { useMaterialOrderLiveStore } from '@/features/material-orders/material-order-live';
import { materialOrderApi, type MaterialOrder } from '@/lib/material-order-api';
import { mediaUrl, vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

export function MaterialOrderDetailPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const tick = useMaterialOrderLiveStore((state) => state.tick);
  const pushToast = useToastStore((s) => s.push);
  const [order, setOrder] = useState<MaterialOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await materialOrderApi.get(id);
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
  }, [id]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!tick) return;
    void load(true);
  }, [tick, load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(action: () => Promise<{ data: { data: MaterialOrder } }>, title: string) {
    setBusy(true);
    try {
      const res = await action();
      setOrder(res.data.data);
      pushToast({ kind: 'success', title });
    } catch (err) {
      pushToast({ kind: 'error', title: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (error || !order) return <ErrorState body={error || undefined} onRetry={() => void load()} />;

  const delivery = placeFromRecord(order);

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.22em] text-copper-500">{t('materialOrder.eyebrow')}</p>
        <h1 className="mt-2 font-display text-3xl text-navy-800">{order.orderCode}</h1>
        <p className="mt-2 text-sm font-semibold text-navy-800">{t(`materialOrder.status.${order.status}`)}</p>
        <p className="mt-1 text-sm text-ink-500">{t(`materialOrder.payment.${order.paymentStatus}`)}</p>
        {order.status === 'DEPOSIT_PAID' ? (
          <dl className="mt-4 space-y-2 rounded-2xl border border-navy-800/10 bg-white px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.paidDeposit')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.depositAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.platformFeePlain')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.platformFeeAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.remaining')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.remainingAmount)}</dd>
            </div>
          </dl>
        ) : null}

        <Card hover={false} className="mt-6">
          <ul className="divide-y divide-navy-800/8">
            {order.items.map((item) => (
              <li key={String(item.materialId)} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-3">
                  {item.imageSnapshot ? (
                    <img src={mediaUrl(item.imageSnapshot)} alt="" className="h-12 w-12 rounded-xl object-cover" />
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
          <p className="mt-4 text-sm text-ink-600">
            <span className="font-semibold text-navy-800">{t('materialOrder.address')}: </span>
            {order.deliveryAddress}
          </p>
          {delivery ? (
            <div className="mt-4">
              <SiteLocationCard title={t('materialOrder.deliveryPlace')} place={delivery} />
            </div>
          ) : null}
          {order.customerNote ? (
            <p className="mt-2 text-sm text-ink-600">
              <span className="font-semibold text-navy-800">{t('materialOrder.note')}: </span>
              {order.customerNote}
            </p>
          ) : null}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.distance')}</dt>
              <dd className="font-semibold text-navy-800">{t('cart.distanceKm', { n: order.distanceKm })}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.materialSubtotal')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.materialSubtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.shipping')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.shippingFee)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-navy-800/8 pt-2">
              <dt className="text-ink-500">{t('materialOrder.total')}</dt>
              <dd className="font-display text-lg text-navy-800">{vnd(order.totalAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.deposit', { rate: order.depositRateSnapshot })}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.depositAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.remaining')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.remainingAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.platformFee', { rate: order.platformFeeRateSnapshot })}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.platformFeeAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">{t('materialOrder.storeDeposit')}</dt>
              <dd className="font-semibold text-navy-800">{vnd(order.storeDepositAmount)}</dd>
            </div>
          </dl>
          {order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED' ? (
            <p className="mt-4 text-sm font-medium text-navy-800">
              {t('materialOrder.directRemaining', { amount: vnd(order.remainingAmount) })}
            </p>
          ) : null}
          {order.remainingSettledOffline ? <p className="mt-2 text-sm text-ink-500">{t('materialOrder.settled')}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {order.status === 'PENDING_PAYMENT' ? (
              <Button variant="copper" disabled={busy} onClick={() => setConfirmPay(true)}>
                {t('materialOrder.payDeposit')}
              </Button>
            ) : null}
            {order.status === 'PENDING_PAYMENT' ? (
              <Button variant="outline" disabled={busy} onClick={() => setConfirmCancel(true)}>
                {t('materialOrder.cancel')}
              </Button>
            ) : null}
            {order.status === 'COMPLETED' && !order.remainingSettledOffline ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => materialOrderApi.settleRemaining(id), t('materialOrder.settled'))}
              >
                {t('materialOrder.settleRemaining')}
              </Button>
            ) : null}
            {order.status === 'DELIVERED' ? (
              <Button disabled={busy} loading={busy} onClick={() => void run(() => materialOrderApi.receive(id), t('materialOrder.received'))}>
                {t('materialOrder.receive')}
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/customer/material-orders">{t('common.back')}</Link>
            </Button>
          </div>
        </Card>
        <Card hover={false} className="mt-4">
          <h2 className="font-display text-2xl text-navy-800">{t('materialOrder.timeline')}</h2>
          <ol className="mt-4 space-y-3">
            {(order.statusHistory || []).map((entry, index) => (
              <li key={`${entry.status}-${entry.createdAt || index}`} className="text-sm">
                <p className="font-semibold text-navy-800">{t(`materialOrder.status.${entry.status}`)}</p>
                <p className="text-ink-400">
                  {entry.createdAt
                    ? new Date(entry.createdAt).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <ConfirmModal
        open={confirmPay}
        title={t('materialOrder.payTitle')}
        description={t('materialOrder.payBody')}
        confirmLabel={t('materialOrder.payDeposit')}
        busy={busy}
        onOpenChange={setConfirmPay}
        onConfirm={() =>
          void run(async () => {
            await materialOrderApi.checkoutDeposit(id);
            const res = await materialOrderApi.captureDeposit(id);
            return { data: { data: res.data.data.order } };
          }, t('materialOrder.paySuccess')).finally(() => setConfirmPay(false))
        }
      />
      <ConfirmModal
        open={confirmCancel}
        title={t('materialOrder.cancelTitle')}
        description={t('materialOrder.cancelBody')}
        confirmLabel={t('materialOrder.cancel')}
        tone="danger"
        busy={busy}
        onOpenChange={setConfirmCancel}
        onConfirm={() => void run(() => materialOrderApi.cancel(id), t('materialOrder.cancelled'))}
      />
    </PageTransition>
  );
}
