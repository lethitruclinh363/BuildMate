import { useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { Check, Search } from 'lucide-react';
import {
  catalogPickLabel,
  collapseServiceName,
  CONTRACTOR_SERVICE_CATEGORIES,
  normalizeServiceName,
  servicePickKey,
  type ContractorServiceCategory,
  type ContractorServicePick,
} from '@/data/contractor-services';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { contractorApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';

const MAX_SERVICES = 40;

type LiveCheck =
  | { code: 'IDLE' | 'CHECKING' | 'ERROR' | 'INVALID' | 'DUPLICATE_OWN' | 'AVAILABLE' }
  | { code: 'DUPLICATE_SYSTEM_SERVICE' | 'DUPLICATE_CUSTOM_SERVICE'; service: ContractorServicePick | null }
  | { code: 'SIMILAR_SERVICE'; similar: ContractorServicePick[] };

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
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<ContractorServiceCategory | ''>('');
  const [catalog, setCatalog] = useState<ContractorServicePick[]>([]);
  const [customDescription, setCustomDescription] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<ContractorServiceCategory | ''>('');
  const [customError, setCustomError] = useState('');
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<LiveCheck>({ code: 'IDLE' });

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

  useEffect(() => {
    if (!customOpen) return undefined;
    const display = collapseServiceName(customName);
    if (!display) {
      setCheck({ code: 'IDLE' });
      return undefined;
    }
    if (display.length > 80) {
      setCheck({ code: 'INVALID' });
      return undefined;
    }
    const normalized = normalizeServiceName(display);
    const owned = selected.some((item) => {
      if (item.type === 'CUSTOM') return normalizeServiceName(item.name) === normalized;
      return [item.name, t(`serviceCatalog.${item.name}`)].some((label) => normalizeServiceName(label) === normalized);
    });
    if (owned) {
      setCheck({ code: 'DUPLICATE_OWN' });
      return undefined;
    }
    const system = catalog.find((item) =>
      [item.name, item.labelKey || '', t(`serviceCatalog.${item.labelKey || item.name}`)].some(
        (label) => normalizeServiceName(label) === normalized
      )
    );
    if (system) {
      setCheck({
        code: 'DUPLICATE_SYSTEM_SERVICE',
        service: {
          category: system.category,
          name: system.labelKey || system.name,
          label: system.name,
          type: 'SYSTEM',
          serviceId: system.catalogKey || system.serviceId,
          status: 'APPROVED',
        },
      });
      return undefined;
    }
    setCheck({ code: 'CHECKING' });
    let ignore = false;
    const timer = window.setTimeout(() => {
      contractorApi
        .checkServiceCatalog(display)
        .then((res) => {
          if (ignore) return;
          const data = res.data.data;
          if (data.code === 'DUPLICATE_SYSTEM_SERVICE' || data.code === 'DUPLICATE_CUSTOM_SERVICE') {
            setCheck({ code: data.code, service: data.service });
            return;
          }
          if (data.code === 'SIMILAR_SERVICE') {
            setCheck({ code: 'SIMILAR_SERVICE', similar: data.similar || (data.service ? [data.service] : []) });
            return;
          }
          if (data.code === 'INVALID') {
            setCheck({ code: 'INVALID' });
            return;
          }
          setCheck({ code: 'AVAILABLE' });
        })
        .catch(() => {
          if (!ignore) setCheck({ code: 'ERROR' });
        });
    }, 400);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [catalog, customName, customOpen, selected, t]);

  function closeCustom() {
    setCustomOpen(false);
    setCustomName('');
    setCustomCategory('');
    setCustomDescription('');
    setCustomError('');
    setCheck({ code: 'IDLE' });
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

  function selectExisting(service: ContractorServicePick) {
    const key = servicePickKey(service);
    if (!selectedKeys.has(key) && selected.length < MAX_SERVICES) {
      onChange([...selected, service]);
    }
    setFilterCategory('');
    setQuery('');
    closeCustom();
    const target = service.type === 'SYSTEM' ? domId(service) : `selected-${servicePickKey(service)}`;
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  }

  async function saveCustom() {
    const display = collapseServiceName(customName);
    if (!display || display.length > 80) {
      setCustomError(t('auth.onboardCustomRequired'));
      return;
    }
    if (!customCategory) {
      setCustomError(t('auth.onboardCustomCategoryRequired'));
      return;
    }
    if (check.code !== 'AVAILABLE' || selected.length >= MAX_SERVICES) return;
    setSaving(true);
    setCustomError('');
    try {
      const { data } = await contractorApi.createCustomService({
        name: display,
        category: customCategory,
        description: collapseServiceName(customDescription),
      });
      const created = data.data;
      onChange([
        ...selected,
        {
          category: created.category,
          name: created.name,
          type: 'CUSTOM',
          serviceId: created.serviceId,
          status: created.status || 'PENDING_APPROVAL',
        },
      ]);
      closeCustom();
    } catch (err) {
      const details = (err as AxiosError<{ details?: { code?: LiveCheck['code']; service?: ContractorServicePick | null } }>).response?.data
        ?.details;
      if (details?.code === 'DUPLICATE_SYSTEM_SERVICE' || details?.code === 'DUPLICATE_CUSTOM_SERVICE') {
        setCheck({ code: details.code, service: details.service || null });
      } else {
        setCustomError(getApiErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const displayName = collapseServiceName(customName);
  const canSave = Boolean(displayName) && displayName.length <= 80 && Boolean(customCategory) && check.code === 'AVAILABLE' && !saving;
  const duplicateService = check.code === 'DUPLICATE_SYSTEM_SERVICE' || check.code === 'DUPLICATE_CUSTOM_SERVICE' ? check.service : null;
  const similarServices = check.code === 'SIMILAR_SERVICE' ? check.similar : [];
  const canPickExisting = Boolean(duplicateService && duplicateService.status !== 'REJECTED');

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

      <label className="block text-sm font-medium text-navy-800">
        {t('auth.onboardServiceSearch')}
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
          setCustomError('');
          setCustomCategory(filterCategory);
        }}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-navy-800/20 bg-white px-3 py-3 text-left text-sm font-semibold text-navy-800"
      >
        + {t('auth.onboardOtherService')}
      </button>

      {customOpen ? (
        <div className="rounded-2xl border border-navy-800/10 bg-paper-50 p-4">
          <p className="text-sm font-semibold text-navy-800">{t('auth.onboardCustomService')}</p>
          <label className="mt-3 block text-sm font-medium text-navy-800">
            {t('auth.onboardCustomName')}
            <input
              value={customName}
              maxLength={80}
              placeholder={t('auth.onboardCustomPlaceholder')}
              onChange={(event) => {
                setCustomName(event.target.value);
                if (customError) setCustomError('');
              }}
              className="mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-navy-800">
            {t('auth.onboardCustomCategory')}
            <select
              value={customCategory}
              onChange={(event) => {
                setCustomCategory(event.target.value as ContractorServiceCategory | '');
                if (customError) setCustomError('');
              }}
              className="mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20"
            >
              <option value="">{t('auth.onboardCustomCategoryPlaceholder')}</option>
              {CONTRACTOR_SERVICE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {t(`category.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium text-navy-800">
            {t('auth.onboardCustomDescription')}
            <textarea
              value={customDescription}
              maxLength={500}
              rows={3}
              onChange={(event) => setCustomDescription(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20"
            />
          </label>

          <div className="mt-3 text-sm" role="status">
            {check.code === 'CHECKING' ? <p className="text-ink-400">{t('auth.onboardCustomChecking')}</p> : null}
            {check.code === 'AVAILABLE' ? (
              <div className="text-emerald-700">
                <p className="font-semibold">✓ {t('auth.onboardCustomAvailableTitle')}</p>
                <p>{t('auth.onboardCustomAvailable')}</p>
                <p className="mt-1 text-emerald-800/80">{t('auth.onboardCustomAvailableNote')}</p>
              </div>
            ) : null}
            {check.code === 'DUPLICATE_OWN' ? <p className="font-medium text-red-600">{t('auth.onboardCustomDuplicate')}</p> : null}
            {check.code === 'SIMILAR_SERVICE' ? (
              <div className="text-amber-700">
                <p className="font-semibold">{t('auth.onboardCustomSimilarTitle')}</p>
                <p>{t('auth.onboardCustomSimilarIntro')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {similarServices.map((item) => (
                    <button
                      key={servicePickKey(item)}
                      type="button"
                      className="rounded-full border border-amber-700/30 px-3 py-1 text-xs font-semibold"
                      onClick={() =>
                        selectExisting({
                          ...item,
                          name: item.labelKey || item.name,
                          label: item.name,
                          type: 'SYSTEM',
                          serviceId: item.catalogKey || item.serviceId,
                          status: 'APPROVED',
                        })
                      }
                    >
                      {t('auth.onboardCustomPickExisting')}: {catalogPickLabel(item, t)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {check.code === 'INVALID' ? <p className="text-red-600">{t('auth.onboardCustomRequired')}</p> : null}
            {check.code === 'ERROR' ? <p className="text-red-600">{t('auth.onboardCustomCheckFailed')}</p> : null}
            {duplicateService ? (
              <div className="text-red-600">
                <p className="font-semibold">❌ {t('auth.onboardCustomExistsTitle')}</p>
                {duplicateService.status === 'REJECTED' ? (
                  <p>{t('auth.onboardCustomRejected')}</p>
                ) : (
                  <>
                    <p>{t('auth.onboardCustomExistsIntro')}</p>
                    <p className="mt-1">
                      {t('auth.onboardCustomExistsNamed', {
                        name: catalogPickLabel(duplicateService, t),
                        category: t(`category.${duplicateService.category}`),
                      })}
                    </p>
                    <p className="mt-1">{t('auth.onboardCustomExistsHint')}</p>
                  </>
                )}
              </div>
            ) : null}
          </div>
          {customError ? <p className="mt-2 text-xs text-red-600">{customError}</p> : null}
          {canPickExisting && duplicateService ? (
            <button
              type="button"
              className="mt-3 h-11 rounded-full border border-navy-800/15 px-5 text-sm font-semibold text-navy-800"
              onClick={() => selectExisting(duplicateService)}
            >
              {t('auth.onboardCustomPickExisting')}
            </button>
          ) : null}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="h-11 rounded-full border border-navy-800/15 px-5 text-sm font-semibold text-navy-800" onClick={closeCustom}>
              {t('auth.onboardCancelCustom')}
            </button>
            <button
              type="button"
              disabled={!canSave}
              className="h-11 rounded-full bg-navy-800 px-5 text-sm font-semibold text-paper-50 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={saveCustom}
            >
              {t('auth.onboardAddService')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
