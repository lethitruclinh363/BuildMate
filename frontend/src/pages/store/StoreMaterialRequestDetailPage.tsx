import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { vnd } from '@/lib/partner-api';
import { materialRequirementApi, type MaterialRequirementList } from '@/lib/material-requirement-api';
import { useI18n } from '@/locales';

export function StoreMaterialRequestDetailPage() {
  const { t, te } = useI18n();
  const { id } = useParams();
  const [list, setList] = useState<MaterialRequirementList | null>(null);
  const [prices, setPrices] = useState<Record<string, { unitPrice: number; availableQty: number; note: string }>>({});
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const total = useMemo(() => {
    if (!list) return 0;
    return (list.items || []).reduce((sum, item) => {
      const row = prices[item.id];
      return sum + item.quantity * Number(row?.unitPrice || 0);
    }, Number(deliveryFee) || 0);
  }, [list, prices, deliveryFee]);

  const onQuote = (event: FormEvent) => {
    event.preventDefault();
    if (!list) return;
    setBusy(true);
    materialRequirementApi
      .quote(list.id, {
        deliveryFee,
        note,
        items: (list.items || []).map((item) => ({
          itemId: item.id,
          unitPrice: Number(prices[item.id]?.unitPrice || 0),
          availableQty: Number(prices[item.id]?.availableQty || 0),
          note: prices[item.id]?.note || '',
        })),
      })
      .then((res) => {
        setList(res.data.data);
        setError('');
      })
      .catch((err: unknown) => setError(te(getApiErrorMessage(err))))
      .finally(() => setBusy(false));
  };

  if (loading) return <DashboardSkeleton />;
  if (error && !list) return <ErrorState body={error} onRetry={() => window.location.reload()} />;
  if (!list) return null;

  return (
    <PageTransition>
      <BackButton fallback="/store/material-requests" />
      <PageHeader eyebrow={t('mrl.storeEyebrow')} title={t('mrl.storeDetailTitle')} description={t('mrl.storeDetailBody')} />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <Badge tone="copper">{list.status}</Badge>
      <form onSubmit={onQuote} className="mt-4 space-y-4">
        {(list.items || []).map((item) => (
          <div key={item.id} className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <p className="font-medium text-navy-800">{item.name}</p>
            <p className="mb-3 text-sm text-ink-400">
              {item.specification || t('mrl.noSpec')} · {item.quantity} {item.unit}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                id={`price-${item.id}`}
                label={t('mrl.unitPrice')}
                type="number"
                min={0}
                step="1"
                value={prices[item.id]?.unitPrice ?? 0}
                onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: { ...prev[item.id], unitPrice: Number(e.target.value) } }))}
                disabled={list.status !== 'SENT'}
              />
              <Input
                id={`qty-${item.id}`}
                label={t('mrl.available')}
                type="number"
                min={0}
                step="0.001"
                value={prices[item.id]?.availableQty ?? 0}
                onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: { ...prev[item.id], availableQty: Number(e.target.value) } }))}
                disabled={list.status !== 'SENT'}
              />
              <Input
                id={`note-${item.id}`}
                label={t('mrl.lineNote')}
                value={prices[item.id]?.note ?? ''}
                onChange={(e) => setPrices((prev) => ({ ...prev, [item.id]: { ...prev[item.id], note: e.target.value } }))}
                disabled={list.status !== 'SENT'}
              />
            </div>
          </div>
        ))}
        <Input id="mrl-fee" label={t('mrl.deliveryFee')} type="number" min={0} step="1" value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} disabled={list.status !== 'SENT'} />
        <Input id="mrl-note" label={t('mrl.notes')} value={note} onChange={(e) => setNote(e.target.value)} disabled={list.status !== 'SENT'} />
        <p className="text-sm font-medium text-navy-800">{t('mrl.total')}: {vnd(total)}</p>
        {list.status === 'SENT' ? (
          <Button type="submit" disabled={busy}>{t('mrl.sendQuote')}</Button>
        ) : (
          <p className="text-sm text-ink-500">{t('mrl.quoteLocked')}</p>
        )}
      </form>
    </PageTransition>
  );
}
