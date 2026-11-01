import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MaterialItemLines } from '@/components/mrl/MaterialItemLines';
import { materialRequirementApi, type MaterialRequirementList } from '@/lib/material-requirement-api';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';

export function MaterialListPicker({
  open,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSend: (list: MaterialRequirementList) => void;
}) {
  const { t, te } = useI18n();
  const [rows, setRows] = useState<MaterialRequirementList[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    materialRequirementApi
      .mine()
      .then((res) => {
        const lists = (res.data.data || []).filter((row) => row.kind === 'SAVED' && row.status === 'DRAFT' && (row.items || []).length);
        setRows(lists);
        setSelectedId(lists[0]?.id || '');
        setError('');
      })
      .catch((err: unknown) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  }, [open, te]);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy-900/40 p-4 sm:place-items-center">
      <div className="w-full max-w-lg rounded-[22px] bg-white p-5 shadow-lift">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper-600">{t('mrl.pickerTitle')}</p>
        <h2 className="mt-1 font-display text-xl text-navy-800">{t('mrl.savedLists')}</h2>
        {loading ? <p className="mt-4 text-sm text-ink-500">{t('common.loading')}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!loading && !rows.length ? <p className="mt-4 text-sm text-ink-500">{t('mrl.pickerEmpty')}</p> : null}
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`w-full rounded-2xl border px-4 py-3 text-left ${selectedId === row.id ? 'border-copper-400 bg-paper-100' : 'border-navy-800/10 bg-white'}`}
            >
              <p className="font-medium text-navy-800">{row.title || row.requestTitle || row.requestCode}</p>
              <p className="text-xs text-ink-400">{row.requestCode} · {(row.items || []).length} {t('mrl.itemCount')}</p>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="mt-4 rounded-2xl border border-navy-800/10 bg-paper-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-copper-600">{t('mrl.preview')}</p>
            <div className="mt-2">
              <MaterialItemLines items={selected.items || []} compact />
            </div>
            {selected.siteAddress ? <p className="mt-2 text-xs text-ink-400">{selected.siteAddress}</p> : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!selected || busy} onClick={() => selected && onSend(selected)}>
            <ClipboardList className="h-4 w-4" />
            {t('mrl.confirmSend')}
          </Button>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </div>
  );
}
