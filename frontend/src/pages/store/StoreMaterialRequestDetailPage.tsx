import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { BackButton } from '@/components/navigation/BackButton';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getApiErrorMessage } from '@/lib/api';
import { MaterialItemLines } from '@/components/mrl/MaterialItemLines';
import { formatQtyWithUnit } from '@/lib/mrl-display';
import { materialStoreApi, vnd } from '@/lib/partner-api';
import type { CatalogMaterial } from '@/types/partner';
import {
  isMrlFulfillment,
  materialRequirementApi,
  MRL_NEXT_FULFILLMENT,
  quoteLineAmount,
  quoteTotalOf,
  type MaterialRequirementList,
} from '@/lib/material-requirement-api';
import { useI18n } from '@/locales';
import { useSocket } from '@/providers/SocketProvider';
import { useToastStore } from '@/store/toast.store';

const STATUS_STEPS = ['SENT', 'QUOTED', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED'] as const;

function statusTone(status: string): 'mist' | 'copper' | 'success' | 'warn' | 'danger' {
  if (status === 'DELIVERED' || status === 'CONFIRMED') return 'success';
  if (status === 'DRAFT' || status === 'SENT') return 'warn';
  if (status === 'CANCELLED') return 'danger';
  return 'copper';
}

export function StoreMaterialRequestDetailPage() {
  const { t, te } = useI18n();
  const { id } = useParams();
  const toast = useToastStore((s) => s.push);
  const { socket } = useSocket();
  const [list, setList] = useState<MaterialRequirementList | null>(null);
  const [catalog, setCatalog] = useState<CatalogMaterial[]>([]);
  const [prices, setPrices] = useState<Record<string, { unitPrice: number; availableQty: number; note: string }>>({});
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryTime, setDeliveryTime] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    materialRequirementApi
      .get(id)
      .then((res) => {
        setList(res.data.data);
        const next: Record<string, { unitPrice: number; availableQty: number; note: string }> = {};
        for (const item of res.data.data.items || []) {
          next[item.id] = { unitPrice: 0, availableQty: item.quantity, note: '' };
        }
        setPrices(next);
        setError('');
      })
      .catch((err: unknown) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  }, [id, te]);

  useEffect(() => {
    materialStoreApi.listMaterials().then((res) => setCatalog(res.data.data || [])).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!socket || !id) return;
    const onUpdate = (next: MaterialRequirementList) => {
      if (String(next?.id) === String(id)) setList(next);
    };
    socket.on('mrl:update', onUpdate);
    return () => {
      socket.off('mrl:update', onUpdate);
    };
  }, [socket, id]);

  const draftTotal = useMemo(() => {
    if (!list) return 0;
    return (list.items || []).reduce((sum, item) => {
      const row = prices[item.id];
      const qty = Number(row?.availableQty || 0);
      return sum + qty * Number(row?.unitPrice || 0);
    }, Number(deliveryFee) || 0);
  }, [list, prices, deliveryFee]);

  const quote = list?.quotes?.[0] || null;
  const confirmedTotal = quote ? quoteTotalOf(quote) : 0;
  const nextStatus = list ? MRL_NEXT_FULFILLMENT[list.status] : undefined;

  const onQuote = (event: FormEvent) => {
    event.preventDefault();
    if (!list || busy || submittingRef.current) return;
    const fee = Number(deliveryFee);
    if (!Number.isFinite(fee) || fee < 0) {
      setError(t('validation.invalid'));
      return;
    }
    const quoted = (list.items || []).map((item) => ({
      itemId: item.id,
      unitPrice: Number(prices[item.id]?.unitPrice),
      availableQty: Number(prices[item.id]?.availableQty),
      note: prices[item.id]?.note || '',
    }));
    if (quoted.some((row) => !Number.isFinite(row.unitPrice) || row.unitPrice < 0 || !Number.isFinite(row.availableQty) || row.availableQty < 0)) {
      setError(t('validation.invalid'));
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    materialRequirementApi
      .quote(list.id, {
        deliveryFee,
        note: [deliveryTime.trim() ? `${t('mrl.deliveryTime')}: ${deliveryTime.trim()}` : '', note.trim()].filter(Boolean).join('\n'),
        items: quoted,
      })
      .then((res) => {
        setList(res.data.data);
        setError('');
        toast({ kind: 'success', title: t('mrl.quoteSentToast') || 'Báo giá đã được gửi thành công' });
      })
      .catch((err: unknown) => setError(te(getApiErrorMessage(err))))
      .finally(() => {
        submittingRef.current = false;
        setBusy(false);
      });
  };

  const onFulfill = () => {
    if (!list || !nextStatus) return;
    setBusy(true);
    materialRequirementApi
      .fulfill(list.id, nextStatus)
      .then((res) => {
        setList(res.data.data);
        setError('');
        toast({ kind: 'success', title: t(`mrl.status.${res.data.data.status}`) });
      })
      .catch((err: unknown) => {
        const message = te(getApiErrorMessage(err));
        setError(message);
        toast({ kind: 'error', title: message });
      })
      .finally(() => setBusy(false));
  };

  if (loading) return <DashboardSkeleton />;
  if (error && !list) return <ErrorState body={error} onRetry={() => window.location.reload()} />;
  if (!list) return null;

  const statusLabel = t(`mrl.status.${list.status}`);

  return (
    <PageTransition>
      <BackButton fallback="/store/material-requests" />
      <PageHeader
        eyebrow={t('mrl.storeEyebrow')}
        title={isMrlFulfillment(list.status) ? t('mrl.orderTitle') : t('mrl.storeDetailTitle')}
        description={t('mrl.storeDetailBody')}
      />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={statusTone(list.status)}>{statusLabel}</Badge>
        {list.requestCode ? <Badge tone="mist">{list.requestCode}</Badge> : null}
      </div>
      <div className="mb-4 rounded-2xl border border-navy-800/10 bg-white p-4 text-sm">
        <p><span className="font-semibold text-navy-800">{t('mrl.customerName')}:</span> {list.customerName || '—'}</p>
        <p className="mt-1"><span className="font-semibold text-navy-800">{t('mrl.siteAddress')}:</span> {list.siteAddress || '—'}</p>
        {list.requestTitle ? <p className="mt-1 text-ink-500">{list.requestTitle}</p> : null}
      </div>

      {list.status === 'SENT' ? (
        <form onSubmit={onQuote} className="mt-4 space-y-4">
          {(list.items || []).map((item) => (
            <div key={item.id} className="rounded-2xl border border-navy-800/10 bg-white p-4">
              <div className="mb-3">
                <MaterialItemLines items={[item]} numbered={false} compact />
              </div>
              {catalog.length ? (
                <label className="mb-3 block text-sm">
                  <span className="mb-1.5 block font-medium text-ink-800">{t('mrl.matchCatalog')}</span>
                  <select
                    className="h-10 w-full rounded-lg border border-navy-800/10 bg-white px-3 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      const product = catalog.find((row) => String(row.id) === e.target.value);
                      if (!product) return;
                      setPrices((prev) => ({
                        ...prev,
                        [item.id]: {
                          unitPrice: Number(product.price || 0),
                          availableQty: prev[item.id]?.availableQty ?? item.quantity,
                          note: `${t('mrl.matchedProduct')}: ${product.name}`,
                        },
                      }));
                    }}
                  >
                    <option value="">{t('mrl.pickProduct')}</option>
                    {catalog.filter((row) => row.isActive !== false).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.unit}{Number(row.stock) > 0 ? ` · ${t('mrl.stock')} ${row.stock}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="mb-3 text-xs text-ink-400">{t('mrl.noCatalogMatch')}</p>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  id={`price-${item.id}`}
                  label={t('mrl.unitPrice')}
                  type="number"
                  min={0}
                  step="1"
                  value={prices[item.id]?.unitPrice ?? 0}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: { ...prev[item.id], unitPrice: Number(e.target.value) } }))}
                />
                <Input
                  id={`qty-${item.id}`}
                  label={t('mrl.available')}
                  type="number"
                  min={0}
                  step="0.001"
                  value={prices[item.id]?.availableQty ?? 0}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: { ...prev[item.id], availableQty: Number(e.target.value) } }))}
                />
                <Input
                  id={`note-${item.id}`}
                  label={t('mrl.lineNote')}
                  value={prices[item.id]?.note ?? ''}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: { ...prev[item.id], note: e.target.value } }))}
                />
              </div>
              <p className="mt-2 text-sm font-medium text-navy-800">
                {t('mrl.lineTotal')}: {vnd(Number(prices[item.id]?.availableQty || 0) * Number(prices[item.id]?.unitPrice || 0))}
              </p>
            </div>
          ))}
          <Input id="mrl-fee" label={t('mrl.deliveryFee')} type="number" min={0} step="1" value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} />
          <Input id="mrl-eta" label={t('mrl.deliveryTime')} value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
          <Input id="mrl-note" label={t('mrl.notes')} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-sm font-medium text-navy-800">{t('mrl.total')}: {vnd(draftTotal)}</p>
          <Button type="submit" disabled={busy}>{busy ? (t('common.loading') || 'Đang gửi...') : t('mrl.sendQuote')}</Button>
        </form>
      ) : null}

      {list.status === 'QUOTED' ? (
        <p className="text-sm text-ink-500">{t('mrl.waitingCustomerConfirm')}</p>
      ) : null}

      {quote && list.status !== 'SENT' ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.quoteTitle')}</h2>
          {(quote.items || []).map((line) => (
            <p key={line.id} className="flex justify-between gap-3 text-sm text-ink-600">
              <span>{line.name} — {formatQtyWithUnit(line.availableQty || line.quantity, line.unit)}</span>
              <span>{vnd(quoteLineAmount(line))}</span>
            </p>
          ))}
          <p className="mt-2 text-sm text-ink-500">{t('mrl.deliveryFee')}: {vnd(quote.deliveryFee)}</p>
          {quote.note ? <p className="mt-1 text-sm text-ink-500">{quote.note}</p> : null}
          <p className="text-sm font-medium text-navy-800">{t('mrl.total')}: {vnd(confirmedTotal)}</p>
        </div>
      ) : null}

      {list.status !== 'DRAFT' ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.statusHistory')}</h2>
          <ol className="space-y-1 text-sm">
            {STATUS_STEPS.map((step) => {
              const currentIndex = STATUS_STEPS.indexOf(list.status as (typeof STATUS_STEPS)[number]);
              const reached = currentIndex >= 0 && STATUS_STEPS.indexOf(step) <= currentIndex;
              return (
                <li key={step} className={reached ? 'font-medium text-navy-800' : 'text-ink-400'}>
                  {t(`mrl.status.${step}`)}
                </li>
              );
            })}
            {list.status === 'CANCELLED' ? <li className="font-medium text-red-700">{t('mrl.status.CANCELLED')}</li> : null}
          </ol>
        </div>
      ) : null}

      {isMrlFulfillment(list.status) ? (
        <div className="rounded-2xl border border-copper-300/70 bg-white p-4">
          {list.status === 'DELIVERED' ? (
            <p className="text-sm text-ink-500">{t('mrl.fulfillmentDone')}</p>
          ) : (
            <Button disabled={busy} onClick={onFulfill}>
              {nextStatus === 'PREPARING' ? t('mrl.createOrder') : nextStatus === 'DELIVERING' ? t('mrl.advanceDelivering') : t('mrl.advanceDelivered')}
            </Button>
          )}
        </div>
      ) : null}
    </PageTransition>
  );
}
