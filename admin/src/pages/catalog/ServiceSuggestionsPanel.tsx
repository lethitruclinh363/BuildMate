import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';
import { getApiErrorMessage } from '@/services/api';
import { adminApi, type ServiceSuggestion } from '@/services/admin.api';
import { useToastStore } from '@/stores/toast.store';

const GROUPS = ['Electrical', 'Plumbing', 'Painting', 'Tiling', 'Interior', 'Repair', 'Construction'] as const;

export function ServiceSuggestionsPanel() {
  const { t, i18n } = useTranslation();
  const push = useToastStore((s) => s.push);
  const [rows, setRows] = useState<ServiceSuggestion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Repair', description: '', status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' });

  const selected = rows.find((row) => row.id === selectedId) || null;

  async function load() {
    const data = await adminApi.listServiceSuggestions();
    setRows(data);
  }

  useEffect(() => {
    void load().catch((err) => push('error', getApiErrorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    if (!selected) return;
    setForm({ name: '', category: 'Repair', description: selected.description, status: 'ACTIVE' });
    setCreating(true);
  }

  async function reject() {
    if (!selected) return;
    setBusy(true);
    try {
      await adminApi.rejectServiceSuggestion(selected.id, note.trim());
      push('success', t('catalog.suggestions.rejected'));
      setNote('');
      setCreating(false);
      await load();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    if (!selected || form.name.trim().length < 2) return;
    setBusy(true);
    try {
      await adminApi.convertServiceSuggestion(selected.id, form);
      push('success', t('catalog.suggestions.converted'));
      setCreating(false);
      await load();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const tag = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <GlassCard>
        <h2 className="text-lg font-semibold text-white">{t('catalog.suggestions.listTitle')}</h2>
        {!rows.length ? <p className="mt-4 text-sm text-white/50">{t('catalog.suggestions.empty')}</p> : null}
        <ul className="mt-3 divide-y divide-white/10">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className="w-full py-3 text-left" onClick={() => { setSelectedId(row.id); setCreating(false); setNote(row.adminNote || ''); }}>
                <p className="text-sm font-semibold text-white">{row.requesterName || t('catalog.suggestions.unknown')}</p>
                <p className="text-xs text-white/55">{row.teamName || '—'} · {new Date(row.createdAt).toLocaleDateString(tag)}</p>
                <p className="mt-1 line-clamp-2 text-sm text-white/80">{row.description}</p>
                <p className="mt-1 text-xs text-copper-300">{t(`catalog.suggestions.status.${row.status}`)}</p>
              </button>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard>
        {!selected ? <p className="text-sm text-white/50">{t('catalog.suggestions.pick')}</p> : null}
        {selected ? (
          <div>
            <p className="text-xs font-semibold uppercase text-white/45">{t('catalog.suggestions.detailTitle')}</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-white/45">{t('catalog.suggestions.requester')}</dt><dd className="text-white">{selected.requesterName || '—'}</dd></div>
              <div><dt className="text-white/45">{t('catalog.suggestions.team')}</dt><dd className="text-white">{selected.teamName || '—'}</dd></div>
              <div><dt className="text-white/45">{t('catalog.suggestions.sent')}</dt><dd className="text-white">{new Date(selected.createdAt).toLocaleString(tag)}</dd></div>
              <div><dt className="text-white/45">{t('catalog.suggestions.body')}</dt><dd className="text-white">{selected.description}</dd></div>
              <div><dt className="text-white/45">{t('catalog.status')}</dt><dd className="text-white">{t(`catalog.suggestions.status.${selected.status}`)}</dd></div>
            </dl>
            {selected.status === 'PENDING' && !creating ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-white/70">
                  {t('catalog.suggestions.note')}
                  <textarea value={note} rows={3} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/12 bg-navy-950/60 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" disabled={busy} onClick={() => void reject()}>{t('catalog.reject')}</Button>
                  <Button disabled={busy} onClick={openCreate}>{t('catalog.suggestions.create')}</Button>
                </div>
              </div>
            ) : null}
            {creating ? (
              <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                <p className="text-sm font-semibold text-white">{t('catalog.suggestions.create')}</p>
                <label className="block text-sm text-white/70">
                  {t('catalog.name')} *
                  <input value={form.name} onChange={(event) => setForm((cur) => ({ ...cur, name: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/12 bg-navy-950/60 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label className="block text-sm text-white/70">
                  {t('catalog.group')} *
                  <select value={form.category} onChange={(event) => setForm((cur) => ({ ...cur, category: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/12 bg-navy-950/60 px-3 py-2 text-sm text-white outline-none">
                    {GROUPS.map((item) => (
                      <option key={item} value={item}>{t(`category.${item}`)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-white/70">
                  {t('catalog.descriptionField')}
                  <textarea value={form.description} rows={3} onChange={(event) => setForm((cur) => ({ ...cur, description: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/12 bg-navy-950/60 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCreating(false)}>{t('catalog.cancel')}</Button>
                  <Button disabled={busy || form.name.trim().length < 2} onClick={() => void convert()}>{t('catalog.save')}</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}
