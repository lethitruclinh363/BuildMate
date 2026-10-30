import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { BackButton } from '@/components/navigation/BackButton';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { quotationApi, repairApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { catalogServiceLabel } from '@/data/contractor-services';
import {
  materialRequirementApi,
  type MaterialQuote,
  type MaterialRequirementList,
} from '@/lib/material-requirement-api';
import { contractorApi } from '@/lib/partner-api';
import { vnd } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { CatalogService } from '@/types/partner';
import { canCreateQuotation, type QuotationItem, type RepairRequest } from '@/types/sprint4';

type LineDraft = { name: string; quantity: number; unit: string; price: number };

const emptyDraft = (): LineDraft => ({ name: '', quantity: 1, unit: 'unit', price: 0 });

function pickConfirmedQuote(list: MaterialRequirementList): MaterialQuote | null {
  const quotes = list.quotes || [];
  return quotes.find((q) => q.status === 'ACCEPTED') || quotes[0] || null;
}

export function CreateQuotationPage() {
  const { t, te } = useI18n();
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<RepairRequest | null>(null);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [materialDraft, setMaterialDraft] = useState<LineDraft>(emptyDraft());
  const [laborDraft, setLaborDraft] = useState<LineDraft>({ name: '', quantity: 1, unit: 'job', price: 0 });
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [transportCost, setTransportCost] = useState(100000);
  const [estimatedDays, setEstimatedDays] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lockedReason, setLockedReason] = useState('');
  const [confirmedMrl, setConfirmedMrl] = useState<MaterialRequirementList | null>(null);
  const [mrlNotice, setMrlNotice] = useState('');

  useEffect(() => {
    if (!requestId) return;
    Promise.all([
      repairApi.get(requestId),
      contractorApi.listServices().catch(() => ({ data: { data: [] as CatalogService[] } })),
      quotationApi.forRequest(requestId).catch(() => ({ data: { data: [] } })),
      materialRequirementApi.mine({ repairRequestId: requestId }).catch(() => ({ data: { data: [] as MaterialRequirementList[] } })),
    ]).then(([req, svcs, quotes, mrlRes]) => {
      const next = req.data.data;
      setRequest(next);
      setServices(svcs.data.data);
      const list = Array.isArray(quotes.data.data) ? quotes.data.data : [];
      const last = list[0] as
        | { status?: string; items?: QuotationItem[]; transportCost?: number; estimatedDays?: number; modificationNote?: string }
        | undefined;
      if (last?.status === 'MODIFICATION_REQUEST') {
        setItems(last.items || []);
        setTransportCost(last.transportCost ?? 100000);
        setEstimatedDays(last.estimatedDays ?? 3);
        setNote(last.modificationNote || '');
      }
      if (list.some((q: { status?: string }) => q.status === 'ACCEPTED')) {
        setLockedReason(te('A quotation was already accepted'));
      } else if (next.status === 'REJECTED') {
        setLockedReason(te('This request was rejected'));
      } else if (next.status === 'CANCELLED') {
        setLockedReason(te('This request was cancelled'));
      } else if (next.status === 'COMPLETED') {
        setLockedReason(te('This request is already completed'));
      } else if (!canCreateQuotation(next.status)) {
        setLockedReason(te('Accept this request before sending a quotation'));
      } else {
        setLockedReason('');
      }

      const mrlLists = Array.isArray(mrlRes.data.data) ? mrlRes.data.data : [];
      const confirmed =
        mrlLists.find((row) => row.status === 'CONFIRMED' && pickConfirmedQuote(row)) || null;
      setConfirmedMrl(confirmed);
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

  const updateItem = (index: number, patch: Partial<QuotationItem>) => {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const applyConfirmedMrl = () => {
    if (!confirmedMrl) return;
    const quote = pickConfirmedQuote(confirmedMrl);
    if (!quote) return;
    const hasMaterials = items.some((i) => i.type === 'MATERIAL');
    if (hasMaterials && !window.confirm(t('quote.mrlOverwriteConfirm'))) return;

    const mapped: QuotationItem[] = (quote.items || []).map((line) => ({
      type: 'MATERIAL' as const,
      name: line.name,
      quantity: Number(line.quantity) || 1,
      unit: line.unit || 'unit',
      price: Number(line.unitPrice) || 0,
    }));
    setItems((prev) => [...prev.filter((i) => i.type !== 'MATERIAL'), ...mapped]);
    setTransportCost(Number(quote.deliveryFee) || 0);
    setMrlNotice(
      t('quote.mrlApplied', {
        store: confirmedMrl.storeName || t('quote.storeFallback'),
        n: mapped.length,
      })
    );
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
    if (totals.total <= 0) {
      setError(t('quote.totalMin'));
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
      <BackButton fallback="/contractor/requests" />
      <PageHeader
        eyebrow={t('quote.createEyebrow')}
        title={`${t('quote.title')} · ${request.title}`}
        description={`${request.customer?.name || t('quote.customerFallback')} · ${labeled(t, 'category', request.category)}`}
      />

      <div className="mb-4 rounded-2xl border border-navy-800/8 bg-white px-4 py-3 text-sm text-ink-600 shadow-card">
        <p>
          <span className="font-semibold text-navy-800">{t('quote.requestMeta')}</span> {request.id}
        </p>
        <p className="mt-1">{request.address || t('contractorRequests.siteFallback')}</p>
        <p className="mt-1 text-ink-500">{request.description}</p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {confirmedMrl ? (
            <div className="rounded-[22px] border border-copper-300/70 bg-copper-50/60 p-4 shadow-card">
              <p className="text-sm font-semibold text-navy-800">{t('quote.mrlReadyTitle')}</p>
              <p className="mt-1 text-sm text-ink-600">
                {t('quote.mrlReadyBody', { store: confirmedMrl.storeName || t('quote.storeFallback') })}
              </p>
              <Button type="button" size="sm" className="mt-3" variant="copper" onClick={applyConfirmedMrl}>
                {t('quote.mrlApply')}
              </Button>
              {mrlNotice ? <p className="mt-2 text-xs text-emerald-700">{mrlNotice}</p> : null}
            </div>
          ) : null}

          <section className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('quote.laborSection')}</p>
            <p className="text-xs text-ink-400">{t('quote.laborHint')}</p>
            <div className="grid gap-2 sm:grid-cols-[1.3fr_0.5fr_0.6fr_0.8fr_auto]">
              <Input
                id="labor-name"
                label={t('quote.laborName')}
                value={laborDraft.name}
                onChange={(e) => setLaborDraft((row) => ({ ...row, name: e.target.value }))}
              />
              <Input
                id="labor-qty"
                label={t('quote.qty')}
                type="number"
                min={1}
                value={laborDraft.quantity}
                onChange={(e) => setLaborDraft((row) => ({ ...row, quantity: Number(e.target.value) || 1 }))}
              />
              <Input
                id="labor-unit"
                label={t('quote.requirementUnit')}
                value={laborDraft.unit}
                onChange={(e) => setLaborDraft((row) => ({ ...row, unit: e.target.value }))}
              />
              <Input
                id="labor-price"
                label={t('quote.requirementPrice')}
                type="number"
                value={laborDraft.price}
                onChange={(e) => setLaborDraft((row) => ({ ...row, price: Number(e.target.value) || 0 }))}
              />
              <Button
                type="button"
                variant="outline"
                className="sm:mt-7"
                onClick={() => {
                  const name = laborDraft.name.trim();
                  if (!name) return;
                  addItem({
                    type: 'LABOR',
                    name,
                    quantity: Number(laborDraft.quantity) || 1,
                    unit: laborDraft.unit.trim() || 'job',
                    price: Number(laborDraft.price) || 0,
                  });
                  setLaborDraft({ name: '', quantity: 1, unit: laborDraft.unit || 'job', price: 0 });
                }}
              >
                {t('common.add')}
              </Button>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-ink-400">{t('quote.fromYard')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {services
                  .filter(
                    (service) =>
                      service.completionStatus !== 'INCOMPLETE' &&
                      service.completionStatus !== 'PENDING_APPROVAL' &&
                      Number(service.basePrice) > 0
                  )
                  .slice(0, 8)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="rounded-full bg-navy-800/8 px-3 py-1.5 text-xs font-semibold text-navy-800"
                      onClick={() =>
                        addItem({
                          type: 'LABOR',
                          name: catalogServiceLabel(s.name, t),
                          quantity: 1,
                          unit: 'job',
                          price: s.basePrice || 0,
                        })
                      }
                    >
                      + {catalogServiceLabel(s.name, t)}
                    </button>
                  ))}
              </div>
            </div>
            <LineList
              items={items}
              type="LABOR"
              onUpdate={updateItem}
              onRemove={removeItem}
              emptyLabel={t('quote.laborEmpty')}
            />
          </section>

          <section className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('quote.materialSection')}</p>
            <div className="grid gap-2 sm:grid-cols-[1.3fr_0.5fr_0.6fr_0.8fr_auto]">
              <Input
                id="mat-name"
                label={t('quote.requirementName')}
                value={materialDraft.name}
                onChange={(e) => setMaterialDraft((row) => ({ ...row, name: e.target.value }))}
              />
              <Input
                id="mat-qty"
                label={t('quote.qty')}
                type="number"
                min={1}
                value={materialDraft.quantity}
                onChange={(e) => setMaterialDraft((row) => ({ ...row, quantity: Number(e.target.value) || 1 }))}
              />
              <Input
                id="mat-unit"
                label={t('quote.requirementUnit')}
                value={materialDraft.unit}
                onChange={(e) => setMaterialDraft((row) => ({ ...row, unit: e.target.value }))}
              />
              <Input
                id="mat-price"
                label={t('quote.requirementPrice')}
                type="number"
                value={materialDraft.price}
                onChange={(e) => setMaterialDraft((row) => ({ ...row, price: Number(e.target.value) || 0 }))}
              />
              <Button
                type="button"
                variant="outline"
                className="sm:mt-7"
                onClick={() => {
                  const name = materialDraft.name.trim();
                  if (!name) return;
                  addItem({
                    type: 'MATERIAL',
                    name,
                    quantity: Number(materialDraft.quantity) || 1,
                    unit: materialDraft.unit.trim() || 'unit',
                    price: Number(materialDraft.price) || 0,
                  });
                  setMaterialDraft({ name: '', quantity: 1, unit: materialDraft.unit || 'unit', price: 0 });
                }}
              >
                {t('common.add')}
              </Button>
            </div>
            <LineList
              items={items}
              type="MATERIAL"
              onUpdate={updateItem}
              onRemove={removeItem}
              emptyLabel={t('quote.materialEmpty')}
            />
          </section>

          <section className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('quote.extraSection')}</p>
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
          </section>
        </div>

        <aside className="h-fit space-y-3 lg:sticky lg:top-20">
          <div className="rounded-[22px] border border-copper-300 bg-white/90 p-6 shadow-lift backdrop-blur">
            <p className="font-display text-xl text-navy-800">{t('quote.summary')}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt>{t('quote.labor')}</dt>
                <dd className="font-semibold">{vnd(totals.laborCost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t('quote.materials')}</dt>
                <dd className="font-semibold">{vnd(totals.materialCost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t('quote.transport')}</dt>
                <dd className="font-semibold">{vnd(Number(transportCost) || 0)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-ink-400">{t('quote.total')}</p>
            <p className="font-display text-3xl text-navy-800">{vnd(totals.total)}</p>
            <p className="mt-1 text-sm text-ink-400">{t('quote.daysWork', { n: estimatedDays })}</p>
            {lockedReason ? <p className="mt-3 text-sm text-amber-700">{lockedReason}</p> : null}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="mt-6 w-full" loading={saving} disabled={Boolean(lockedReason)}>
              {t('quote.sendToChat')}
            </Button>
          </div>
        </aside>
      </form>
    </PageTransition>
  );
}

function LineList({
  items,
  type,
  onUpdate,
  onRemove,
  emptyLabel,
}: {
  items: QuotationItem[];
  type: QuotationItem['type'];
  onUpdate: (index: number, patch: Partial<QuotationItem>) => void;
  onRemove: (index: number) => void;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const rows = items
    .map((item, index) => ({ item, index }))
    .filter((row) => row.item.type === type);
  if (!rows.length) {
    return <p className="text-sm text-ink-400">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map(({ item, index }) => (
        <li key={`${item.type}-${index}-${item.name}`} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 font-medium text-navy-800">{item.name}</span>
          <input
            type="number"
            min={1}
            value={item.quantity}
            aria-label={t('quote.qty')}
            className="h-9 w-16 rounded-xl border border-navy-800/10 px-2"
            onChange={(e) => onUpdate(index, { quantity: Number(e.target.value) || 1 })}
          />
          <span className="w-12 text-xs text-ink-400">{item.unit}</span>
          <input
            type="number"
            min={0}
            value={item.price}
            aria-label={t('quote.requirementPrice')}
            className="h-9 w-24 rounded-xl border border-navy-800/10 px-2"
            onChange={(e) => onUpdate(index, { price: Number(e.target.value) || 0 })}
          />
          <span className="w-28 text-right font-semibold">{vnd(item.quantity * item.price)}</span>
          <button type="button" className="text-xs text-red-600" onClick={() => onRemove(index)}>
            {t('common.remove')}
          </button>
        </li>
      ))}
    </ul>
  );
}
