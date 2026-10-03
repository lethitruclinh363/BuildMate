import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { getApiErrorMessage } from '@/services/api';
import { adminApi, type AdminCatalogPayload, type AdminCatalogService } from '@/services/admin.api';
import { MaterialCatalogPanel } from '@/pages/catalog/MaterialCatalogPanel';
import { useToastStore } from '@/stores/toast.store';

const GROUPS = ['Electrical', 'Plumbing', 'Painting', 'Tiling', 'Interior', 'Repair', 'Construction'] as const;

const emptyForm = { name: '', category: 'Electrical', description: '', status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' };

export function ServiceCatalogPage() {
  const { t } = useTranslation();
  const push = useToastStore((s) => s.push);
  const [data, setData] = useState<AdminCatalogPayload | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCatalogService | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [similar, setSimilar] = useState<string[]>([]);
  const [acknowledgeSimilar, setAcknowledgeSimilar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'services' | 'materials'>('services');

  const load = async (next?: { q?: string; category?: string; status?: string }) => {
    const payload = await adminApi.listCatalog({
      q: next?.q ?? query,
      category: next?.category ?? category,
      status: next?.status ?? status,
    });
    setData(payload);
  };

  useEffect(() => {
    void load().catch((err) => push('error', getApiErrorMessage(err)));
    // The first load uses the initial empty filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSimilar([]);
    setAcknowledgeSimilar(false);
    setOpen(true);
  }

  function openEdit(item: AdminCatalogService) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      description: item.description || '',
      status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
    setSimilar([]);
    setAcknowledgeSimilar(false);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      const body = { ...form, acknowledgeSimilar };
      if (editing) await adminApi.updateCatalog(editing.id, body);
      else await adminApi.createCatalog(body);
      setOpen(false);
      push('success', t('catalog.saved'));
      await load();
    } catch (err) {
      const details = (err as AxiosError<{ details?: { code?: string; similar?: { name: string }[] } }>).response?.data?.details;
      if (details?.code === 'SIMILAR_SERVICE') {
        setSimilar((details.similar || []).map((item) => item.name));
        return;
      }
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: AdminCatalogService) {
    setBusy(true);
    try {
      await adminApi.setCatalogStatus(item.id, item.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE');
      push('success', t('catalog.statusSaved'));
      await load();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, decision: 'approve' | 'reject') {
    setBusy(true);
    try {
      await adminApi.reviewCatalogService(id, decision);
      push('success', decision === 'approve' ? t('catalog.approved') : t('catalog.rejected'));
      await load();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const stats = data?.stats;

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.system')}
        title={t('catalog.title')}
        description={tab === 'materials' ? t('catalog.materials.description') : t('catalog.description')}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={tab === 'services'} onClick={() => setTab('services')}>
          {t('catalog.materials.tabServices')}
        </FilterChip>
        <FilterChip active={tab === 'materials'} onClick={() => setTab('materials')}>
          {t('catalog.materials.tabMaterials')}
        </FilterChip>
      </div>
      {tab === 'materials' ? <MaterialCatalogPanel /> : null}
      {tab === 'services' ? (
      <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [stats?.total ?? 0, t('catalog.total')],
          [stats?.active ?? 0, t('catalog.active')],
          [stats?.inactive ?? 0, t('catalog.inactive')],
          [stats?.proposals ?? 0, t('catalog.proposals')],
        ].map(([value, label]) => (
          <GlassCard key={String(label)}>
            <p className="font-display text-3xl text-white">{value}</p>
            <p className="mt-1 text-sm text-white/55">{label}</p>
          </GlassCard>
        ))}
      </div>

      {data?.proposals?.length ? (
        <GlassCard className="mb-5">
          <h2 className="font-display text-lg">{t('catalog.proposalTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {data.proposals.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-white/55">
                    {t(`category.${item.category}`)}
                    {item.proposerName ? ` · ${item.proposerName}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-copper-300">{t('catalog.pending')}</p>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void review(item.id, 'approve')}>
                    {t('catalog.approve')}
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => void review(item.id, 'reject')}>
                    {t('catalog.reject')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            value={query}
            placeholder={t('catalog.search')}
            onChange={(event) => {
              const q = event.target.value;
              setQuery(q);
              void load({ q }).catch((err) => push('error', getApiErrorMessage(err)));
            }}
            className="w-full max-w-sm rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none focus:border-copper-500/60"
          />
          <Button onClick={openCreate}>{t('catalog.add')}</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip active={category === ''} onClick={() => { setCategory(''); void load({ category: '' }); }}>
            {t('catalog.all')}
          </FilterChip>
          {GROUPS.map((item) => (
            <FilterChip
              key={item}
              active={category === item}
              onClick={() => {
                setCategory(item);
                void load({ category: item });
              }}
            >
              {t(`category.${item}`)}
            </FilterChip>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {['', 'ACTIVE', 'INACTIVE'].map((item) => (
            <FilterChip
              key={item || 'all-status'}
              active={status === item}
              onClick={() => {
                setStatus(item);
                void load({ status: item });
              }}
            >
              {item === 'ACTIVE' ? t('catalog.activeOption') : item === 'INACTIVE' ? t('catalog.inactiveOption') : t('catalog.all')}
            </FilterChip>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="py-2">{t('catalog.name')}</th>
                <th>{t('catalog.group')}</th>
                <th>{t('catalog.status')}</th>
                <th>{t('catalog.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((item) => (
                <tr key={item.id} className="border-t border-white/8 text-white">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">{item.name}</p>
                    {item.description ? <p className="text-xs text-white/45">{item.description}</p> : null}
                  </td>
                  <td>{t(`category.${item.category}`)}</td>
                  <td>{item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={busy} onClick={() => openEdit(item)}>
                        {t('catalog.edit')}
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => void toggle(item)}>
                        {item.status === 'INACTIVE' ? t('catalog.activate') : t('catalog.deactivate')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.items?.length ? <p className="py-6 text-sm text-white/45">{t('catalog.empty')}</p> : null}
        </div>
      </GlassCard>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4">
          <GlassCard className="w-full max-w-lg">
            <h2 className="font-display text-xl">{editing ? t('catalog.edit') : t('catalog.add')}</h2>
            <label className="mt-4 block text-sm text-white/70">
              {t('catalog.name')}
              <input
                value={form.name}
                onChange={(event) => {
                  setForm((cur) => ({ ...cur, name: event.target.value }));
                  setSimilar([]);
                  setAcknowledgeSimilar(false);
                }}
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none"
              />
            </label>
            <label className="mt-3 block text-sm text-white/70">
              {t('catalog.group')}
              <select
                value={form.category}
                onChange={(event) => setForm((cur) => ({ ...cur, category: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none"
              >
                {GROUPS.map((item) => (
                  <option key={item} value={item}>
                    {t(`category.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm text-white/70">
              {t('catalog.descriptionField')}
              <textarea
                value={form.description}
                rows={3}
                onChange={(event) => setForm((cur) => ({ ...cur, description: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none"
              />
            </label>
            <label className="mt-3 block text-sm text-white/70">
              {t('catalog.status')}
              <select
                value={form.status}
                onChange={(event) => setForm((cur) => ({ ...cur, status: event.target.value as 'ACTIVE' | 'INACTIVE' }))}
                className="mt-1.5 w-full rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-2.5 text-sm text-white outline-none"
              >
                <option value="ACTIVE">{t('catalog.activeOption')}</option>
                <option value="INACTIVE">{t('catalog.inactiveOption')}</option>
              </select>
            </label>
            {similar.length ? (
              <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
                <p>{t('catalog.similar')}</p>
                <p className="mt-1">{similar.join(', ')}</p>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={acknowledgeSimilar} onChange={(event) => setAcknowledgeSimilar(event.target.checked)} />
                  {t('catalog.confirmSimilar')}
                </label>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t('catalog.cancel')}
              </Button>
              <Button disabled={busy || !form.name.trim() || (similar.length > 0 && !acknowledgeSimilar)} onClick={() => void save()}>
                {t('catalog.save')}
              </Button>
            </div>
          </GlassCard>
        </div>
      ) : null}
      </>
      ) : null}
    </div>
  );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? 'bg-copper-500 text-navy-950' : 'bg-white/8 text-white/70'}`}
    >
      {children}
    </button>
  );
}
