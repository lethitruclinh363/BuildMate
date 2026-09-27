import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { quotationApi, repairApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { contractorApi } from '@/lib/partner-api';
import { vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { CatalogService } from '@/types/partner';
import type { QuotationItem, RepairRequest } from '@/types/sprint4';

export function CreateQuotationPage() {
  const { t, te } = useI18n();
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<RepairRequest | null>(null);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [requirement, setRequirement] = useState({ name: '', unit: 'unit', price: 0 });
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [transportCost, setTransportCost] = useState(100000);
  const [estimatedDays, setEstimatedDays] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lockedReason, setLockedReason] = useState('');

  useEffect(() => {
    if (!requestId) return;
    Promise.all([
      repairApi.get(requestId),
      contractorApi.listServices().catch(() => ({ data: { data: [] as CatalogService[] } })),
      quotationApi.forRequest(requestId).catch(() => ({ data: { data: [] } })),
    ]).then(([req, svcs, quotes]) => {
      const next = req.data.data;
      setRequest(next);
      setServices(svcs.data.data);
      const list = quotes.data.data;
      const last = list[0];
      if (last?.status === 'MODIFICATION_REQUEST') {
        setItems(last.items);
        setTransportCost(last.transportCost);
        setEstimatedDays(last.estimatedDays);
        setNote(last.modificationNote || '');
      }
      if (list.some((q) => q.status === 'ACCEPTED')) {
        setLockedReason(te('A quotation was already accepted'));
      } else if (next.status === 'REJECTED') {
        setLockedReason(te('This request was rejected'));
      } else if (next.status === 'COMPLETED') {
        setLockedReason(te('This request is already completed'));
      } else {
        setLockedReason('');
      }
    });
  }, [requestId, te]);

  const totals = useMemo(() => {
    const materialCost = items
      .filter((i) => i.type === 'MATERIAL')
      .reduce((s, i) => s + i.quantity * i.price, 0);
    const laborCost = items.filter((i) => i.type === 'LABOR').reduce((s, i) => s + i.quantity * i.price, 0);
    return { materialCost, laborCost, total: materialCost + laborCost + Number(transportCost || 0) };
  }, [items, transportCost]);

  const addItem = (item: QuotationItem) => {
    setItems((prev) => [...prev, item]);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (lockedReason) {
      setError(lockedReason);
      return;
    }
    if (!requestId || items.length === 0) {
      setError(t('quote.addFirst'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await quotationApi.create({
        requestId,
        items,
        transportCost: Number(transportCost),
        estimatedDays: Number(estimatedDays),
        note,
      });
      if (request?.roomId) navigate(`/contractor/chat/${request.roomId}`);
      else navigate('/contractor/requests');
    } catch (err) {
      setError(te(getApiErrorMessage(err)) || t('quote.sendFail'));
    } finally {
      setSaving(false);
    }
  };

  if (!request) return <DashboardSkeleton />;

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('quote.createEyebrow')}
        title={`${t('quote.title')} · ${request.title}`}
        description={`${request.customer?.name || t('quote.customerFallback')} · ${labeled(t, 'category', request.category)}`}
      />
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-[22px] border border-navy-800/8 bg-white p-6 shadow-card">
          <p className="text-sm text-ink-600">{request.description}</p>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-copper-600">{t('quote.requirement')}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1.4fr_0.6fr_0.8fr_auto]">
              <Input
                id="req-name"
                label={t('quote.requirementName')}
                value={requirement.name}
                onChange={(e) => setRequirement((row) => ({ ...row, name: e.target.value }))}
              />
              <Input
                id="req-unit"
                label={t('quote.requirementUnit')}
                value={requirement.unit}
                onChange={(e) => setRequirement((row) => ({ ...row, unit: e.target.value }))}
              />
              <Input
                id="req-price"
                label={t('quote.requirementPrice')}
                type="number"
                value={requirement.price}
                onChange={(e) => setRequirement((row) => ({ ...row, price: Number(e.target.value) }))}
              />
              <Button
                type="button"
                variant="outline"
                className="sm:mt-7"
                onClick={() => {
                  const name = requirement.name.trim();
                  if (!name) return;
                  addItem({
                    type: 'MATERIAL',
                    name,
                    quantity: 1,
                    unit: requirement.unit.trim() || 'unit',
                    price: Number(requirement.price) || 0,
                  });
                  setRequirement({ name: '', unit: requirement.unit, price: 0 });
                }}
              >
                {t('common.add')}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-copper-600">{t('quote.fromYard')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {services.slice(0, 6).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="rounded-full bg-navy-800/8 px-3 py-1.5 text-xs font-semibold text-navy-800"
                  onClick={() =>
                    addItem({ type: 'LABOR', name: s.name, quantity: 1, unit: 'job', price: s.basePrice })
                  }
                >
                  + {s.name}
                </button>
              ))}
            </div>
          </div>
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="flex items-center gap-2 text-sm">
                <span className="w-20 text-xs uppercase text-ink-400">{labeled(t, 'itemType', item.type)}</span>
                <span className="flex-1">{item.name}</span>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  className="h-9 w-16 rounded-xl border border-navy-800/10 px-2"
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, quantity: Number(e.target.value) } : row))
                    )
                  }
                />
                <span className="w-28 text-right font-semibold">{vnd(item.quantity * item.price)}</span>
                <button type="button" className="text-xs text-red-600" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="transport"
              label={t('quote.transportField')}
              type="number"
              value={transportCost}
              onChange={(e) => setTransportCost(Number(e.target.value))}
            />
            <Input
              id="days"
              label={t('quote.daysField')}
              type="number"
              value={estimatedDays}
              onChange={(e) => setEstimatedDays(Number(e.target.value))}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{t('quote.note')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm"
            />
          </label>
        </div>
        <aside className="h-fit rounded-[22px] border border-copper-300 bg-white/80 p-6 shadow-lift backdrop-blur">
          <p className="font-display text-xl text-navy-800">{t('quote.summary')}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>{t('quote.materials')}</dt>
              <dd className="font-semibold">{vnd(totals.materialCost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('quote.labor')}</dt>
              <dd className="font-semibold">{vnd(totals.laborCost)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('quote.transport')}</dt>
              <dd className="font-semibold">{vnd(Number(transportCost) || 0)}</dd>
            </div>
          </dl>
          <p className="mt-4 font-display text-3xl text-navy-800">{vnd(totals.total)}</p>
          <p className="text-sm text-ink-400">{t('quote.daysWork', { n: estimatedDays })}</p>
          {lockedReason ? <p className="mt-3 text-sm text-amber-700">{lockedReason}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="mt-6 w-full" loading={saving} disabled={Boolean(lockedReason)}>
            {t('quote.sendToChat')}
          </Button>
        </aside>
      </form>
    </PageTransition>
  );
}
