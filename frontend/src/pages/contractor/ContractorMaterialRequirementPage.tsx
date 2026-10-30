import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  type CatalogMatch,
  type EligibleStore,
  type MaterialRequirementList,
} from '@/lib/material-requirement-api';
import { useI18n } from '@/locales';

const emptyItem = { name: '', specification: '', unit: '', quantity: 1, notes: '' };

export function ContractorMaterialRequirementPage() {
  const { t, te } = useI18n();
  const { requestId, listId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<MaterialRequirementList | null>(null);
  const [matches, setMatches] = useState<CatalogMatch[]>([]);
  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [item, setItem] = useState(emptyItem);
  const [storeId, setStoreId] = useState('');
  const [selectedStoreName, setSelectedStoreName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (id: string) => {
    const res = await materialRequirementApi.get(id);
    setList(res.data.data);
    setStoreId(res.data.data.storeId || '');
    setSelectedStoreName(res.data.data.storeName || '');
    const [catalog, eligible] = await Promise.all([
      materialRequirementApi.catalog(id).catch(() => ({ data: { data: [] as CatalogMatch[] } })),
      materialRequirementApi.eligibleStores(id).catch(() => ({ data: { data: [] as EligibleStore[] } })),
    ]);
    setMatches(catalog.data.data || []);
    setStores(eligible.data.data || []);
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        if (listId) {
          await load(listId);
        } else if (requestId) {
          const created = await materialRequirementApi.create({ requestId });
          if (!ignore) {
            navigate(`/contractor/material-requirements/${created.data.data.id}`, { replace: true });
          }
          return;
        }
        setError('');
      } catch (err: unknown) {
        if (!ignore) setError(te(getApiErrorMessage(err)));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [listId, requestId]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setError('');
    } catch (err: unknown) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!list) return;
    void run(async () => {
      const res = await materialRequirementApi.addItem(list.id, item);
      setList(res.data.data);
      setItem(emptyItem);
    });
  };

  if (loading) return <DashboardSkeleton />;
  if (error && !list) return <ErrorState body={error} onRetry={() => window.location.reload()} />;
  if (!list) return null;

  const quote = list.quotes?.[0];
  const draft = list.status === 'DRAFT';

  return (
    <PageTransition>
      <BackButton fallback="/contractor/requests" />
      <PageHeader eyebrow={t('mrl.eyebrow')} title={t('mrl.title')} description={t('mrl.body')} />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={draft ? 'warn' : list.status === 'CONFIRMED' ? 'success' : 'copper'}>{list.status}</Badge>
        {list.storeName ? <Badge tone="mist">{list.storeName}</Badge> : null}
      </div>

      {draft ? (
        <form onSubmit={onAdd} className="mb-6 grid gap-3 rounded-2xl border border-navy-800/10 bg-white p-4 md:grid-cols-2">
          <Input id="mrl-name" label={t('mrl.name')} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} required />
          <Input id="mrl-spec" label={t('mrl.spec')} value={item.specification} onChange={(e) => setItem({ ...item, specification: e.target.value })} />
          <Input id="mrl-unit" label={t('mrl.unit')} value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })} />
          <Input id="mrl-qty" label={t('mrl.qty')} type="number" min={0.001} step="0.001" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: Number(e.target.value) })} required />
          <div className="md:col-span-2">
            <Input id="mrl-notes" label={t('mrl.notes')} value={item.notes} onChange={(e) => setItem({ ...item, notes: e.target.value })} />
          </div>
          <div>
            <Button type="submit" disabled={busy}>{t('mrl.addItem')}</Button>
          </div>
        </form>
      ) : null}

      <div className="mb-6 overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
        {(list.items || []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-400">{t('mrl.emptyItems')}</p>
        ) : (
          (list.items || []).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/5 px-4 py-3 last:border-0">
              <div>
                <p className="font-medium text-navy-800">{row.name}</p>
                <p className="text-sm text-ink-400">
                  {row.specification || t('mrl.noSpec')} · {row.quantity} {row.unit || t('mrl.unitFallback')}
                </p>
              </div>
              {draft ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
                  const res = await materialRequirementApi.removeItem(list.id, row.id);
                  setList(res.data.data);
                })}>
                  {t('mrl.remove')}
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {draft ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.sendTitle')}</h2>
          <p className="mb-3 text-sm text-ink-500">{t('mrl.pickStore')}</p>
          {selectedStoreName ? (
            <p className="mb-3 text-sm font-medium text-navy-800">{t('mrl.selectedStore')}: {selectedStoreName}</p>
          ) : null}
          <div className="mb-3 grid gap-2">
            {stores.length ? stores.map((row) => (
              <button
                key={row.storeId}
                id={`mrl-store-${row.storeId}`}
                type="button"
                className={`rounded-xl border px-3 py-2 text-left ${storeId === row.storeId ? 'border-copper-400 bg-copper-50' : 'border-navy-800/10 hover:bg-paper-100'}`}
                onClick={() => {
                  setStoreId(row.storeId);
                  setSelectedStoreName(row.name);
                }}
              >
                <p className="font-medium text-navy-800">{row.name}</p>
                <p className="text-sm text-ink-400">
                  {row.city || t('mrl.noSpec')} · {row.sampleMaterial} · {vnd(Number(row.samplePrice || 0))}
                </p>
              </button>
            )) : (
              <p className="text-sm text-ink-400">{t('mrl.noStores')}</p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={busy || !storeId} onClick={() => void run(async () => {
              const res = await materialRequirementApi.send(list.id, storeId);
              setList(res.data.data);
              setSelectedStoreName(res.data.data.storeName || selectedStoreName);
            })}>
              {t('mrl.send')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
              const res = await materialRequirementApi.cancel(list.id);
              setList(res.data.data);
            })}>
              {t('mrl.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {(list.status === 'QUOTED' || list.status === 'CONFIRMED') && quote ? (
        <div className="mb-6 rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.quoteTitle')}</h2>
          {(quote.items || []).map((line) => (
            <p key={line.id} className="text-sm text-ink-600">
              {line.name} · {line.quantity} × {vnd(line.unitPrice)}
            </p>
          ))}
          <p className="mt-2 text-sm text-ink-500">{t('mrl.deliveryFee')}: {vnd(quote.deliveryFee)}</p>
          <p className="text-sm font-medium text-navy-800">
            {t('mrl.total')}: {vnd((quote.items || []).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) + Number(quote.deliveryFee || 0))}
          </p>
          {list.status === 'QUOTED' ? (
            <Button className="mt-3" disabled={busy} onClick={() => void run(async () => {
              const res = await materialRequirementApi.confirm(list.id);
              setList(res.data.data);
            })}>
              {t('mrl.confirm')}
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-ink-500">{t('mrl.confirmedHint')}</p>
              {list.requestId ? (
                <Button
                  type="button"
                  onClick={() => navigate(`/contractor/quotation/create/${list.requestId}`)}
                >
                  {t('mrl.continueQuote')}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {matches.length ? (
        <div className="rounded-2xl border border-navy-800/10 bg-white p-4">
          <h2 className="mb-3 font-display text-lg text-navy-800">{t('mrl.matches')}</h2>
          <div className="grid gap-3">
            {matches.slice(0, 12).map((row) => (
              <button
                key={`${row.storeId}-${row.materialId}`}
                type="button"
                className="rounded-xl border border-navy-800/10 px-3 py-2 text-left hover:bg-paper-100"
                onClick={() => {
                  setStoreId(row.storeId);
                  setSelectedStoreName(row.storeName);
                }}
              >
                <p className="font-medium text-navy-800">{row.name}</p>
                <p className="text-sm text-ink-400">
                  {row.storeName} · {vnd(row.price)} · {t('mrl.stock')} {row.stock}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </PageTransition>
  );
}
