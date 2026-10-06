import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  catalogPickLabel,
  CONTRACTOR_SERVICE_CATEGORIES,
  normalizeServiceName,
  servicePickKey,
  type ContractorServiceCategory,
  type ContractorServicePick,
} from '@/data/contractor-services';
import { getApiErrorMessage } from '@/lib/api';
import { FormLabel } from '@/components/ui/FormLabel';
import { cn } from '@/lib/cn';
import { useToastStore } from '@/store/toast.store';
import { contractorApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';

const MAX_SERVICES = 40;

function domId(item: ContractorServicePick) {
  if (item.type === 'CUSTOM') return `selected-${servicePickKey(item)}`;
  return `onboard-service-${item.category}-${item.name}`.replace(/\s+/g, '-');
}

export function ContractorServiceSelector({
  selected,
  onChange,
}: {
  selected: ContractorServicePick[];
  onChange: (next: ContractorServicePick[]) => void;
}) {
  const { t } = useI18n();
  const pushToast = useToastStore((state) => state.push);
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<ContractorServiceCategory | ''>('');
  const [catalog, setCatalog] = useState<ContractorServicePick[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [suggestionError, setSuggestionError] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);

  const selectedKeys = useMemo(() => new Set(selected.map((item) => servicePickKey(item))), [selected]);

  useEffect(() => {
    let ignore = false;
    contractorApi
      .listServiceCatalog()
      .then((res) => {
        if (!ignore) setCatalog(res.data.data || []);
      })
      .catch(() => {
        if (!ignore) setCatalog([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .map((item) => ({
        category: item.category,
        name: item.labelKey || item.name,
        label: item.name,
        labelKey: item.labelKey,
        type: 'SYSTEM' as const,
        serviceId: item.catalogKey || item.serviceId,
        status: 'APPROVED' as const,
      }))
      .filter((item) => {
        if (filterCategory && item.category !== filterCategory) return false;
        if (!needle) return true;
        const label = `${item.label} ${item.name} ${t(`category.${item.category}`)}`.toLowerCase();
        return label.includes(needle);
      });
  }, [catalog, filterCategory, query, t]);

  function closeCustom() {
    setCustomOpen(false);
    setSuggestion('');
    setSuggestionError('');
  }

  function removeCustom(name: string) {
    const key = normalizeServiceName(name);
    onChange(selected.filter((entry) => !(entry.type === 'CUSTOM' && normalizeServiceName(entry.name) === key)));
  }

  function toggle(item: ContractorServicePick) {
    const key = servicePickKey(item);
    if (selectedKeys.has(key)) {
      onChange(selected.filter((entry) => servicePickKey(entry) !== key));
      return;
    }
    if (selected.length >= MAX_SERVICES) return;
    onChange([...selected, item]);
  }

  async function sendSuggestion() {
    const text = suggestion.replace(/\s+/g, ' ').trim();
    if (text.length < 8) {
      setSuggestionError(t('auth.suggestRequired'));
      return;
    }
    setSending(true);
    setSuggestionError('');
    try {
      await contractorApi.createServiceSuggestion(text);
      setSuggestion('');
      setCustomOpen(false);
      setSuggestionSent(true);
      pushToast({ kind: 'success', title: t('auth.suggestSent') });
    } catch (err) {
      setSuggestionError(getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-navy-800">
          {t('auth.onboardSelected')} ({selected.length})
        </p>
        {selected.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {selected.map((item) =>
              item.type === 'CUSTOM' ? (
                <li
                  id={domId(item)}
                  key={servicePickKey(item)}
                  className="flex max-w-full items-center gap-2 rounded-2xl border border-navy-800/10 bg-paper-50 px-3 py-2"
                >
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-800">{item.name}</span>
                    <span className="block text-xs text-ink-400">
                      {item.status === 'APPROVED' ? t(`category.${item.category}`) : t('auth.onboardCustomLabel')}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ml-auto px-1 text-base font-semibold leading-none text-ink-400"
                    aria-label={t('common.remove')}
                    onClick={() => removeCustom(item.name)}
                  >
                    ×
                  </button>
                </li>
              ) : (
                <li key={servicePickKey(item)}>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    className="rounded-full bg-navy-800 px-3 py-1.5 text-left text-sm font-semibold text-paper-50"
                  >
                    {catalogPickLabel(item, t)}
                    <span className="ml-2 text-[11px] font-medium text-white/70">{t(`category.${item.category}`)}</span>
                  </button>
                </li>
              )
            )}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-400">{t('auth.onboardServicePick')}</p>
        )}
      </div>

      <label className="block">
        <FormLabel optional={t('auth.onboardOptionalMark')}>{t('auth.onboardServiceSearch')}</FormLabel>
        <span className="relative mt-1.5 block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-2xl border border-navy-800/12 bg-white py-3 pl-11 pr-4 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20"
          />
        </span>
      </label>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterCategory('')}
          className={cn(
            'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold',
            filterCategory === '' ? 'border-navy-800 bg-navy-800 text-paper-50' : 'border-navy-800/15 bg-white text-navy-800'
          )}
        >
          {t('auth.onboardServiceAll')}
        </button>
        {CONTRACTOR_SERVICE_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilterCategory(item)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold',
              filterCategory === item ? 'border-navy-800 bg-navy-800 text-paper-50' : 'border-navy-800/15 bg-white text-navy-800'
            )}
          >
            {t(`category.${item}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-paper-50 px-4 py-6 text-sm text-ink-400">{t('auth.onboardNoService')}</p>
      ) : (
        <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
          {visible.map((item) => {
            const active = selectedKeys.has(servicePickKey(item));
            const label = catalogPickLabel(item, t);
            return (
              <li key={servicePickKey(item)}>
                <button
                  id={domId(item)}
                  type="button"
                  onClick={() => toggle(item)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left',
                    active ? 'border-navy-800 bg-navy-800/5' : 'border-navy-800/10 bg-white'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      active ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-800/20 bg-white'
                    )}
                  >
                    {active ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-800">{label}</span>
                    <span className="block text-xs text-ink-400">{t(`category.${item.category}`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          setCustomOpen(true);
          setSuggestionError('');
        }}
        className="text-sm font-semibold text-navy-800"
      >
        + {t('auth.onboardOtherService')}
      </button>

      {suggestionSent ? <p className="text-sm text-ink-500">{t('auth.suggestPending')}</p> : null}

      {customOpen ? (
        <div className="border-t border-navy-800/10 pt-4">
          <p className="text-sm font-semibold text-navy-800">{t('auth.suggestTitle')}</p>
          <p className="mt-1 text-sm text-ink-500">{t('auth.suggestLead')}</p>
          <p className="mt-2 text-xs text-ink-400">{t('auth.onboardRequiredNote')}</p>
          <label className="mt-3 block">
            <FormLabel required>{t('auth.suggestDescription')}</FormLabel>
            <textarea
              value={suggestion}
              maxLength={500}
              rows={3}
              placeholder={t('auth.suggestPlaceholder')}
              onChange={(event) => {
                setSuggestion(event.target.value);
                if (suggestionError) setSuggestionError('');
              }}
              className={cn(
                'mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-navy-800 outline-none',
                suggestionError ? 'border-red-500' : 'border-navy-800/15'
              )}
            />
            <p className="mt-1 text-xs text-ink-400">{t('auth.suggestExample')}</p>
            {suggestionError ? <p className="mt-1 text-xs text-red-600">{suggestionError}</p> : null}
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="h-10 rounded-lg border border-navy-800/15 px-4 text-sm font-medium text-navy-800" onClick={closeCustom}>
              {t('auth.onboardCancelCustom')}
            </button>
            <button
              type="button"
              disabled={sending}
              className="h-10 rounded-lg bg-navy-800 px-4 text-sm font-medium text-paper-50 disabled:opacity-60"
              onClick={() => void sendSuggestion()}
            >
              {t('auth.suggestSubmit')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
