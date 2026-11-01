import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { BackButton } from '@/components/navigation/BackButton';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { quotationApi, repairApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { materialRequirementApi, type MaterialRequirementList } from '@/lib/material-requirement-api';
import { contractorApi } from '@/lib/partner-api';
import { vnd } from '@/lib/partner-api';
import { formatMrlQuantity, formatMrlSpec, mrlIndex, unitLooksLikeQuantity } from '@/lib/mrl-display';
import { guardNumberKeyDown, guardNumberPaste } from '@/lib/numeric-input';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { CatalogService } from '@/types/partner';
import { RepairRequestBrief } from '@/features/repair/components/RepairRequestBrief';
import { canCreateQuotation, type QuotationItem, type RepairRequest } from '@/types/sprint4';

type LineDraft = { name: string; quantity: number; unit: string; price: number };
type MaterialLine = { name: string; specification: string; unit: string; quantity: number; notes: string };
type MaterialDraft = { name: string; specification: string; unit: string; quantity: string; notes: string };

function emptyMaterial(): MaterialDraft {
  return { name: '', specification: '', unit: '', quantity: '', notes: '' };
}

function toMaterialLine(row: {
  name?: string;
  specification?: string;
  unit?: string;
  quantity?: string | number;
  notes?: string;
}): MaterialLine {
  return {
    name: String(row.name || '').trim(),
    specification: String(row.specification || '').trim(),
    unit: String(row.unit || '').trim(),
    quantity: Number(row.quantity),
    notes: String(row.notes || '').trim(),
  };
}

function toQuotePayloadItems(items: QuotationItem[]) {
  return items
    .filter((item) => item.type === 'LABOR')
    .map((item) => {
      const catalogId = item.catalogId ? String(item.catalogId) : undefined;
      return {
        type: 'LABOR' as const,
        name: String(item.name || '').trim(),
        quantity: Number(item.quantity) || 0,
        unit: item.unit || '',
        price: Number(item.price) || 0,
        ...(catalogId ? { catalogId } : {}),
      };
    });
}

export function CreateQuotationPage() {
  const { t, te } = useI18n();
  const { requestId } = useParams();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.push);
  const sendingRef = useRef(false);
  const [request, setRequest] = useState<RepairRequest | null>(null);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [laborDraft, setLaborDraft] = useState<LineDraft>({ name: '', quantity: 1, unit: 'job', price: 0 });
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [estimatedDays, setEstimatedDays] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lockedReason, setLockedReason] = useState('');
  const [mrl, setMrl] = useState<MaterialRequirementList | null>(null);
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const [materialDraft, setMaterialDraft] = useState<MaterialDraft>(emptyMaterial());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

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
        | {
            status?: string;
            items?: QuotationItem[];
            estimatedDays?: number;
            note?: string;
            modificationNote?: string;
          }
        | undefined;
      if (last?.status === 'MODIFICATION_REQUEST') {
        setItems(toQuotePayloadItems(last.items || []));
        setEstimatedDays(last.estimatedDays ?? 3);
        setNote(last.note || last.modificationNote || '');
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
      const nextMrl = mrlLists.find((row) => row.status !== 'CANCELLED') || null;
      setMrl(nextMrl);
      if (nextMrl?.items?.length) {
        setMaterials(nextMrl.items.map((row) => toMaterialLine(row)));
      }
    });
  }, [requestId, te]);

  const totals = useMemo(() => {
    const laborCost = items.filter((i) => i.type === 'LABOR').reduce((s, i) => s + i.quantity * i.price, 0);
    return { laborCost, total: laborCost };
  }, [items]);

  const addItem = (item: QuotationItem) => {
    setItems((prev) => [...prev, item]);
  };

  const updateItem = (index: number, patch: Partial<QuotationItem>) => {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const packedMaterial = (): MaterialLine | null => {
    const next = toMaterialLine(materialDraft);
    if (unitLooksLikeQuantity(materialDraft.unit)) {
      setError(t('mrl.unitLooksLikeQty'));
      return null;
    }
    if (!next.unit) {
      setError(t('mrl.unitRequired'));
      return null;
    }
    if (!Number.isFinite(next.quantity) || next.quantity <= 0) {
      setError(t('mrl.qtyMustBePositive'));
      return null;
    }
    if (!next.name) {
      setError(t('quote.mrlInvalid'));
      return null;
    }
    return next;
  };

  const addMaterial = () => {
    const next = packedMaterial();
    if (!next) return;
    setMaterials((prev) => [...prev, next]);
    setMaterialDraft(emptyMaterial());
    setEditingIndex(null);
    setError('');
  };

  const startEditMaterial = (index: number) => {
    const row = materials[index];
    if (!row) return;
    setEditingIndex(index);
    setMaterialDraft({
      name: row.name,
      specification: row.specification,
      unit: row.unit,
      quantity: formatMrlQuantity(row.quantity),
      notes: row.notes,
    });
    setError('');
  };

  const cancelEditMaterial = () => {
    setEditingIndex(null);
    setMaterialDraft(emptyMaterial());
  };

  const saveMaterial = () => {
    if (editingIndex == null) {
      addMaterial();
      return;
    }
    const next = packedMaterial();
    if (!next) return;
    setMaterials((prev) => prev.map((row, i) => (i === editingIndex ? next : row)));
    setMaterialDraft(emptyMaterial());
    setEditingIndex(null);
    setError('');
  };

  const removeMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
    setDeleteIndex(null);
    if (editingIndex === index) {
      setEditingIndex(null);
      setMaterialDraft(emptyMaterial());
    } else if (editingIndex != null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const canEditMrl = !mrl || mrl.status === 'DRAFT';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sendingRef.current || saving) return;
    if (lockedReason) {
      setError(lockedReason);
      return;
    }
    if (!requestId || items.length === 0) {
      setError(t('quote.addFirst'));
      return;
    }
    const days = Number(estimatedDays);
    if (!Number.isInteger(days) || days < 1 || days > 180) {
      setError(t('quote.daysInvalid'));
      return;
    }
    if (items.some((row) => !Number.isInteger(row.quantity) || row.quantity < 1 || !Number.isFinite(row.price) || row.price < 0)) {
      setError(t('validation.invalid'));
      return;
    }
    if (totals.total <= 0) {
      setError(t('quote.totalMin'));
      return;
    }
    let rows = materials;
    if (
      materialDraft.name.trim() ||
      materialDraft.specification.trim() ||
      materialDraft.unit.trim() ||
      materialDraft.notes.trim() ||
      String(materialDraft.quantity).trim()
    ) {
      const next = packedMaterial();
      if (!next) return;
      rows = editingIndex == null
        ? [...materials, next]
        : materials.map((row, i) => (i === editingIndex ? next : row));
    }
    const filled = rows.filter(
      (row) => row.name.trim() || row.specification.trim() || row.unit.trim() || row.notes.trim()
    );
    for (const row of filled) {
      if (unitLooksLikeQuantity(row.unit)) {
        setError(t('mrl.unitLooksLikeQty'));
        return;
      }
      if (row.name.trim().length < 2 || !row.unit.trim() || !(Number(row.quantity) > 0)) {
        setError(t('quote.mrlInvalid'));
        return;
      }
    }
    const mrlItems = filled.map((row) => {
      const next = toMaterialLine(row);
      return {
        name: next.name,
        specification: next.specification,
        unit: next.unit,
        quantity: next.quantity,
        notes: next.notes,
      };
    });
    sendingRef.current = true;
    setSaving(true);
    setError('');
    try {
      if (canEditMrl && (mrlItems.length > 0 || mrl?.status === 'DRAFT')) {
        await materialRequirementApi.create({ requestId, items: mrlItems });
      }
      await quotationApi.create({
        requestId,
        items: toQuotePayloadItems(items),
        transportCost: 0,
        estimatedDays: days,
        note,
      });
      toast({ kind: 'success', title: t('quote.sentOk') });
      if (request?.roomId) navigate(`/contractor/chat/${request.roomId}`);
      else navigate('/contractor/requests');
    } catch (err) {
      setError(te(getApiErrorMessage(err)) || t('quote.sendFail'));
    } finally {
      sendingRef.current = false;
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
        description={`${request.customer?.name || t('quote.customerFallback')} · ${catalogCategoryLabel(String(request.category || ''), t)}`}
      />

      <div className="mb-4 space-y-3">
        <p className="text-sm text-ink-500">
          <span className="font-semibold text-navy-800">{t('quote.requestMeta')}</span> {request.id}
        </p>
        <section className="rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
          <p className="font-display text-lg text-navy-800">{t('quote.requestContext')}</p>
          <div className="mt-4">
            <RepairRequestBrief item={request} />
          </div>
        </section>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
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
                step={1}
                value={laborDraft.quantity}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next) || next < 1) return;
                  setLaborDraft((row) => ({ ...row, quantity: Math.trunc(next) }));
                }}
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
                min={0}
                step="1"
                value={laborDraft.price}
                onChange={(e) => {
                  if (e.target.value === '') {
                    setLaborDraft((row) => ({ ...row, price: 0 }));
                    return;
                  }
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next) || next < 0) return;
                  setLaborDraft((row) => ({ ...row, price: next }));
                }}
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
                    quantity: Math.max(1, Math.trunc(Number(laborDraft.quantity) || 1)),
                    unit: laborDraft.unit.trim() || 'job',
                    price: Number.isFinite(Number(laborDraft.price)) && Number(laborDraft.price) >= 0 ? Number(laborDraft.price) : 0,
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
            <LineList items={items} onUpdate={updateItem} onRemove={removeItem} emptyLabel={t('quote.laborEmpty')} />
          </section>

          <section className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('mrl.title')}</p>
            <p className="text-sm text-ink-500">{t('quote.mrlLaborHint')}</p>
            <p className="text-xs text-ink-400">{t('quote.mrlNoPrice')}</p>
            <p className="text-sm font-medium text-navy-800">{t('quote.mrlAddedCount', { n: materials.length })}</p>
            {materials.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[36rem] w-full text-sm">
                  <thead>
                    <tr className="border-y border-navy-800/8 text-left text-xs uppercase tracking-[0.12em] text-ink-400">
                      <th className="py-2 pr-2 font-medium">{t('mrl.stt')}</th>
                      <th className="py-2 pr-2 font-medium">{t('mrl.name')}</th>
                      <th className="py-2 pr-2 font-medium">{t('mrl.spec')}</th>
                      <th className="py-2 pr-2 text-right font-medium">{t('mrl.qtyShort')}</th>
                      <th className="py-2 pr-2 font-medium">{t('mrl.unit')}</th>
                      <th className="py-2 text-right font-medium">{t('quote.mrlActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((row, index) => (
                      <tr key={`${row.name}-${index}`} className="border-b border-navy-800/8 align-top">
                        <td className="py-2.5 pr-2 text-ink-400">{mrlIndex(index)}</td>
                        <td className="py-2.5 pr-2">
                          <p className="font-semibold text-navy-800">{row.name}</p>
                          {row.notes ? <p className="mt-0.5 text-xs text-ink-400">{row.notes}</p> : null}
                        </td>
                        <td className="py-2.5 pr-2 text-ink-600">{formatMrlSpec(row.specification) || t('mrl.specMissing')}</td>
                        <td className="py-2.5 pr-2 text-right font-semibold text-navy-800">{formatMrlQuantity(row.quantity)}</td>
                        <td className="py-2.5 pr-2 text-ink-600">{formatMrlSpec(row.unit)}</td>
                        <td className="py-2.5">
                          {canEditMrl ? (
                            <div className="flex justify-end gap-2">
                              <button type="button" className="text-xs font-medium text-navy-800 hover:underline" onClick={() => startEditMaterial(index)}>
                                {t('quote.editMaterial')}
                              </button>
                              <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => setDeleteIndex(index)}>
                                {t('mrl.remove')}
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-400">{t('mrl.emptyItems')}</p>
            )}
            {canEditMrl ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      id="mrl-name"
                      label={t('mrl.name')}
                      placeholder={t('mrl.namePh')}
                      value={materialDraft.name}
                      onChange={(e) => setMaterialDraft((row) => ({ ...row, name: e.target.value }))}
                    />
                  </div>
                  <Input
                    id="mrl-spec"
                    label={t('mrl.spec')}
                    placeholder={t('mrl.specPh')}
                    value={materialDraft.specification}
                    onChange={(e) => setMaterialDraft((row) => ({ ...row, specification: e.target.value }))}
                  />
                  <Input
                    id="mrl-unit"
                    label={t('mrl.unitLabel')}
                    placeholder={t('mrl.unitPh')}
                    value={materialDraft.unit}
                    onChange={(e) => setMaterialDraft((row) => ({ ...row, unit: e.target.value }))}
                    error={unitLooksLikeQuantity(materialDraft.unit) ? t('mrl.unitLooksLikeQty') : undefined}
                  />
                  <Input
                    id="mrl-qty"
                    label={t('mrl.qty')}
                    type="number"
                    min={0.001}
                    step="any"
                    placeholder={t('mrl.qtyPh')}
                    value={materialDraft.quantity}
                    onKeyDown={(e) => guardNumberKeyDown(e, 0.001)}
                    onPaste={(e) => guardNumberPaste(e, 0.001)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setMaterialDraft((row) => ({ ...row, quantity: '' }));
                        return;
                      }
                      const next = Number(raw);
                      if (!Number.isFinite(next) || next < 0) return;
                      setMaterialDraft((row) => ({ ...row, quantity: raw }));
                    }}
                  />
                  <Input
                    id="mrl-notes"
                    label={t('mrl.notes')}
                    placeholder={t('mrl.notesPh')}
                    value={materialDraft.notes}
                    onChange={(e) => setMaterialDraft((row) => ({ ...row, notes: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingIndex == null ? (
                    <Button type="button" variant="outline" size="sm" onClick={addMaterial}>
                      {t('quote.addToList')}
                    </Button>
                  ) : (
                    <>
                      <Button type="button" size="sm" onClick={saveMaterial}>
                        {t('quote.saveMaterial')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={cancelEditMaterial}>
                        {t('common.cancel')}
                      </Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-500">{t('mrl.contractorLocked')}</p>
            )}
          </section>

          <section className="space-y-3 rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('quote.extraSection')}</p>
            <Input
              id="days"
              label={t('quote.daysField')}
              type="number"
              min={1}
              max={180}
              step={1}
              value={estimatedDays}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next) || next < 1) return;
                setEstimatedDays(Math.min(180, Math.trunc(next)));
              }}
            />
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
                <dt>{t('quote.time')}</dt>
                <dd className="font-semibold">{t('quote.daysWork', { n: estimatedDays })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t('mrl.title')}</dt>
                <dd className="font-semibold">{t('quote.mrlCount', { n: materials.length })}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-ink-400">{t('quote.labor')}</p>
            <p className="font-display text-3xl text-navy-800">{vnd(totals.total)}</p>
            <p className="mt-1 text-sm text-ink-400">{t('quote.mrlNoPrice')}</p>
            {lockedReason ? <p className="mt-3 text-sm text-amber-700">{lockedReason}</p> : null}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="mt-6 w-full" loading={saving} disabled={Boolean(lockedReason)}>
              {t('quote.sendToChat')}
            </Button>
          </div>
        </aside>
      </form>
      <ConfirmModal
        open={deleteIndex != null}
        title={t('quote.removeMaterialTitle')}
        description={t('quote.removeMaterialBody')}
        tone="danger"
        confirmLabel={t('mrl.remove')}
        onOpenChange={(open) => !open && setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex != null) removeMaterial(deleteIndex);
        }}
      />
    </PageTransition>
  );
}

function LineList({
  items,
  onUpdate,
  onRemove,
  emptyLabel,
}: {
  items: QuotationItem[];
  onUpdate: (index: number, patch: Partial<QuotationItem>) => void;
  onRemove: (index: number) => void;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const rows = items.map((item, index) => ({ item, index })).filter((row) => row.item.type === 'LABOR');
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
            step={1}
            value={item.quantity}
            aria-label={t('quote.qty')}
            className="h-9 w-16 rounded-xl border border-navy-800/10 px-2"
            onKeyDown={(e) => guardNumberKeyDown(e, 1)}
            onPaste={(e) => guardNumberPaste(e, 1)}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next) || next < 1) return;
              onUpdate(index, { quantity: Math.trunc(next) });
            }}
          />
          <span className="w-12 text-xs text-ink-400">{item.unit}</span>
          <input
            type="number"
            min={0}
            step="1"
            value={item.price}
            aria-label={t('quote.requirementPrice')}
            className="h-9 w-24 rounded-xl border border-navy-800/10 px-2"
            onKeyDown={(e) => guardNumberKeyDown(e, 0)}
            onPaste={(e) => guardNumberPaste(e, 0)}
            onChange={(e) => {
              if (e.target.value === '') {
                onUpdate(index, { price: 0 });
                return;
              }
              const next = Number(e.target.value);
              if (!Number.isFinite(next) || next < 0) return;
              onUpdate(index, { price: next });
            }}
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
