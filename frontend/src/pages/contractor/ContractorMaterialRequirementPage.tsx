import { FormEvent, useEffect, useState } from 'react';
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
import { materialRequirementApi, type MaterialRequirementList } from '@/lib/material-requirement-api';
import { MaterialItemLines } from '@/components/mrl/MaterialItemLines';
import { unitLooksLikeQuantity } from '@/lib/mrl-display';
import { useI18n } from '@/locales';

const emptyItem = { name: '', specification: '', unit: '', quantity: '', notes: '' };

export function ContractorMaterialRequirementPage() {
  const { t, te } = useI18n();
  const { requestId, listId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<MaterialRequirementList | null>(null);
  const [item, setItem] = useState(emptyItem);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (id: string) => {
    const res = await materialRequirementApi.get(id);
    setList(res.data.data);
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
    const qty = Number(item.quantity);
    if (unitLooksLikeQuantity(item.unit)) {
      setError(t('mrl.unitLooksLikeQty'));
      return;
    }
    if (!item.unit.trim()) {
      setError(t('mrl.unitRequired'));
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t('mrl.qtyMustBePositive'));
      return;
    }
    void run(async () => {
      const res = await materialRequirementApi.addItem(list.id, {
        ...item,
        unit: item.unit.trim(),
        quantity: qty,
      });
      setList(res.data.data);
      setItem(emptyItem);
    });
  };

  if (loading) return <DashboardSkeleton />;
  if (error && !list) return <ErrorState body={error} onRetry={() => window.location.reload()} />;
  if (!list) return null;

  const draft = list.status === 'DRAFT';

  return (
    <PageTransition>
      <BackButton fallback="/contractor/requests" />
      <PageHeader eyebrow={t('mrl.eyebrow')} title={t('mrl.title')} description={t('mrl.body')} />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={draft ? 'warn' : list.status === 'DELIVERED' ? 'success' : 'copper'}>{t(`mrl.status.${list.status}`)}</Badge>
        {list.storeName ? <Badge tone="mist">{list.storeName}</Badge> : null}
      </div>

      {draft ? (
        <form onSubmit={onAdd} className="mb-6 grid gap-3 rounded-2xl border border-navy-800/10 bg-white p-4 md:grid-cols-2">
          <Input id="mrl-name" label={t('mrl.name')} placeholder={t('mrl.namePh')} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} required />
          <Input id="mrl-spec" label={t('mrl.spec')} placeholder={t('mrl.specPh')} value={item.specification} onChange={(e) => setItem({ ...item, specification: e.target.value })} />
          <Input id="mrl-unit" label={t('mrl.unitLabel')} placeholder={t('mrl.unitPh')} value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })} error={unitLooksLikeQuantity(item.unit) ? t('mrl.unitLooksLikeQty') : undefined} />
          <Input id="mrl-qty" label={t('mrl.qty')} type="number" min={0.001} step="any" placeholder={t('mrl.qtyPh')} value={item.quantity} onChange={(e) => {
            if (e.target.value === '' || Number(e.target.value) >= 0) setItem({ ...item, quantity: e.target.value });
          }} required />
          <div className="md:col-span-2">
            <Input id="mrl-notes" label={t('mrl.notes')} placeholder={t('mrl.notesPh')} value={item.notes} onChange={(e) => setItem({ ...item, notes: e.target.value })} />
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
            <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-800/5 px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <MaterialItemLines items={[row]} numbered={false} compact />
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
        <div className="mb-6 flex flex-wrap gap-2">
          {list.requestId ? (
            <Button asChild>
              <Link to={`/contractor/quotation/create/${list.requestId}`}>{t('mrl.continueQuote')}</Link>
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const res = await materialRequirementApi.cancel(list.id);
            setList(res.data.data);
          })}>
            {t('mrl.cancel')}
          </Button>
        </div>
      ) : (
        <p className="mb-6 text-sm text-ink-500">
          {list.status === 'DELIVERED' ? t('mrl.contractorDelivered') : t('mrl.contractorLocked')}
        </p>
      )}
    </PageTransition>
  );
}
