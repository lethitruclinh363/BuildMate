import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import {
  materialRequirementApi,
  quoteLineAmount,
  quoteTotalOf,
  type MaterialRequirementList,
} from '@/lib/material-requirement-api';
import { MaterialItemLines } from '@/components/mrl/MaterialItemLines';
import { formatQtyWithUnit } from '@/lib/mrl-display';
import { useI18n } from '@/locales';
import { useSocket } from '@/providers/SocketProvider';
import { useToastStore } from '@/store/toast.store';

export function CustomerMaterialListPage() {
  const { t, te } = useI18n();
  const { listId } = useParams();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.push);
  const { socket } = useSocket();
  const [list, setList] = useState<MaterialRequirementList | null>(null);
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const applyList = (next: MaterialRequirementList) => {
    setList(next);
    setTitle(next.title || next.requestTitle || '');
    const nextQty: Record<string, number> = {};
    const nextNotes: Record<string, string> = {};
    for (const item of next.items || []) {
      nextQty[item.id] = item.quantity;
      nextNotes[item.id] = item.notes || '';
    }
    setQty(nextQty);
    setNotes(nextNotes);
  };

  const load = async (id: string) => {
    const res = await materialRequirementApi.get(id);
    applyList(res.data.data);
  };

  useEffect(() => {
    if (!listId) return;
    let ignore = false;
    setLoading(true);
    load(listId)
      .then(() => {
        if (!ignore) setError('');
      })
      .catch((err: unknown) => {
        if (!ignore) setError(te(getApiErrorMessage(err)));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [listId, te]);

  useEffect(() => {
    if (!socket || !listId) return;
    const onUpdate = (next: MaterialRequirementList) => {
      if (String(next?.id) === String(listId)) applyList(next);
    };
    socket.on('mrl:update', onUpdate);
    return () => {
      socket.off('mrl:update', onUpdate);
    };
  }, [socket, listId]);

  const quote = list?.quotes?.[0] || null;
  const total = useMemo(() => (quote ? quoteTotalOf(quote) : 0), [quote]);

  const run = async (work: () => Promise<void>, successTitle: string) => {
    setBusy(true);
    try {
      await work();
      toast({ kind: 'success', title: successTitle });
      setError('');
    } catch (err: unknown) {
      const message = te(getApiErrorMessage(err));
      setError(message);
      toast({ kind: 'error', title: message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error && !list) return <ErrorState body={error} onRetry={() => window.location.reload()} />;
  if (!list) return null;

  const draft = list.kind === 'SAVED' && list.status === 'DRAFT';

  return (
    <PageTransition>
      <BackButton fallback="/customer/material-lists" />
      <PageHeader
        eyebrow={t('mrl.customerEyebrow')}
        title={list.title || list.requestTitle || t('mrl.customerTitle')}
        description={t('mrl.customerBody')}
      />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={list.status === 'DELIVERED' || list.status === 'CONFIRMED' ? 'success' : draft ? 'warn' : 'copper'}>
          {t(`mrl.status.${list.status}`)}
        </Badge>
        {list.requestCode ? <Badge tone="mist">{list.requestCode}</Badge> : null}
        {list.storeName ? <Badge tone="mist">{list.storeName}</Badge> : null}
      </div>
      {list.siteAddress ? (
        <div className="mb-4 rounded-2xl border border-navy-800/10 bg-white p-4 text-sm">
          <p><span className="font-semibold text-navy-800">{t('mrl.siteAddress')}:</span> {list.siteAddress}</p>
          {list.storeName ? <p className="mt-1 text-ink-500">{t('mrl.sentStore')}: {list.storeName}</p> : null}
        </div>
      ) : null}

      {draft ? (
        <div className="mb-4 rounded-2xl border border-navy-800/10 bg-white p-4">
          <Input id="mrl-title" label={t('mrl.rename')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button
            className="mt-3"
            variant="outline"
            disabled={busy || !title.trim()}
            onClick={() => void run(async () => {
              const res = await materialRequirementApi.updateSaved(list.id, { title: title.trim() });
              applyList(res.data.data);
            }, t('mrl.renamedToast'))}
          >
            {t('mrl.rename')}
          </Button>
        </div>
      ) : null}

      <div className="mb-6 overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
        {(list.items || []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-400">{t('mrl.emptyItems')}</p>
        ) : (
          (list.items || []).map((row) => (
            <div key={row.id} className="border-b border-navy-800/5 px-4 py-3 last:border-0">
              <p className="font-medium text-navy-800">{row.name}</p>
              {draft ? (
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <p className="md:col-span-2 text-sm text-ink-500">
                    {t('mrl.spec')}: {row.specification?.trim() || t('mrl.specMissing')} · {t('mrl.unit')}: {row.unit || t('mrl.specMissing')}
                  </p>
                  <Input
                    id={`qty-${row.id}`}
                    label={t('mrl.qty')}
                    type="number"
                    min={0.001}
                    step="0.001"
                    value={qty[row.id] ?? row.quantity}
                    onChange={(e) => setQty((prev) => ({ ...prev, [row.id]: Number(e.target.value) }))}
                    onBlur={() => {
                      if (Number(qty[row.id]) === row.quantity) return;
                      void run(async () => {
                        const res = await materialRequirementApi.updateItem(list.id, row.id, {
                          name: row.name,
                          specification: row.specification,
                          unit: row.unit,
                          quantity: Number(qty[row.id]),
                          notes: notes[row.id] || '',
                        });
                        applyList(res.data.data);
                      }, t('mrl.savedToast'));
                    }}
                  />
                  <Input
                    id={`note-${row.id}`}
                    label={t('mrl.notes')}
                    value={notes[row.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    onBlur={() => {
                      if ((notes[row.id] || '') === (row.notes || '')) return;
                      void run(async () => {
                        const res = await materialRequirementApi.updateItem(list.id, row.id, {
                          name: row.name,
                          specification: row.specification,
                          unit: row.unit,
                          quantity: Number(qty[row.id] || row.quantity),
                          notes: notes[row.id] || '',
                        });
                        applyList(res.data.data);
                      }, t('mrl.savedToast'));
                    }}
                  />
                </div>
              ) : (
                <div className="mt-1">
                  <MaterialItemLines items={[row]} numbered={false} compact />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {list.kind === 'SOURCE' && list.status === 'DRAFT' ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <p className="mb-3 text-sm text-ink-500">{t('mrl.pickStoreCustomer')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => void run(async () => {
                const res = await materialRequirementApi.save(list.id);
                navigate(`/customer/material-lists/${res.data.data.id}`);
              }, t('mrl.savedToast'))}
            >
              {t('mrl.saveList')}
            </Button>
            <Button asChild variant="outline">
              <Link id="mrl-choose-store-map" to={`/customer/explore?mrl=${list.id}`}>{t('mrl.findNearby')}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.sendTitle')}</h2>
          <p className="mb-4 text-sm text-ink-500">{t('mrl.pickStoreCustomer')}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link id="mrl-choose-store-map" to={`/customer/explore?mrl=${list.id}`}>{t('mrl.findNearby')}</Link>
            </Button>
            <Button
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50"
              disabled={busy}
              onClick={() => void run(async () => {
                await materialRequirementApi.cancel(list.id);
                navigate('/customer/material-lists');
              }, t('mrl.cancel'))}
            >
              {t('mrl.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {quote ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.quoteTitle')}</h2>
          {(quote.items || []).map((line) => (
            <p key={line.id} className="flex justify-between gap-3 text-sm text-ink-600">
              <span>{line.name} — {formatQtyWithUnit(line.availableQty || line.quantity, line.unit)}</span>
              <span>{vnd(quoteLineAmount(line))}</span>
            </p>
          ))}
          {Number(quote.deliveryFee) > 0 ? (
            <p className="mt-2 text-sm text-ink-500">{t('mrl.deliveryFee')}: {vnd(quote.deliveryFee)}</p>
          ) : null}
          {quote.note ? <p className="mt-1 text-sm text-ink-500">{quote.note}</p> : null}
          <p className="text-sm font-medium text-navy-800">{t('mrl.total')}: {vnd(total)}</p>
          <p className="mt-3 text-sm text-ink-500">{t('mrl.advisoryQuoteHint')}</p>
        </div>
      ) : list.status === 'SENT' ? (
        <p className="mb-6 text-sm text-ink-500">{t('mrl.waitingQuote')}</p>
      ) : null}
    </PageTransition>
  );
}
