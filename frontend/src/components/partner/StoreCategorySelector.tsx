import { useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { X } from 'lucide-react';
import {
  categoryDisplayLabel,
  collapseCategoryName,
  findOwnedCategoryMatch,
  findSystemCategoryMatch,
  materialCategoryKey,
  type MaterialCategoryPick,
} from '@/data/material-categories';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { materialStoreApi } from '@/lib/partner-api';
import { useI18n } from '@/locales';

const MAX_CATEGORIES = 12;

function categoryError(code: string | undefined, t: (key: string) => string) {
  if (code === 'DUPLICATE_SYSTEM_CATEGORY') return t('auth.onboardCategorySystemDuplicate');
  if (code === 'DUPLICATE_CUSTOM_CATEGORY') return t('auth.onboardCategoryCustomDuplicate');
  if (code === 'INVALID') return t('auth.onboardCategoryRequired');
  return '';
}

export function StoreCategorySelector({
  selected,
  onChange,
}: {
  selected: MaterialCategoryPick[];
  onChange: (next: MaterialCategoryPick[]) => void;
}) {
  const { t } = useI18n();
  const [system, setSystem] = useState<MaterialCategoryPick[]>([]);
  const [owned, setOwned] = useState<MaterialCategoryPick[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customError, setCustomError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let ignore = false;
    materialStoreApi
      .listMaterialCategories()
      .then((res) => {
        if (ignore) return;
        setSystem(res.data.data?.system || []);
        setOwned(res.data.data?.custom || []);
        setLoadError(false);
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const selectedKeys = useMemo(() => new Set(selected.map((item) => materialCategoryKey(item))), [selected]);

  const customChips = useMemo(
    () => owned.filter((item) => !findSystemCategoryMatch(item.name, system) && !selected.some((picked) => picked.categoryId && picked.categoryId === item.categoryId)),
    [owned, selected, system]
  );

  function remove(item: MaterialCategoryPick) {
    const key = materialCategoryKey(item);
    onChange(
      selected.filter((entry) => {
        if (item.categoryId && entry.categoryId && entry.categoryId === item.categoryId) return false;
        return materialCategoryKey(entry) !== key;
      })
    );
  }

  function selectSystem(item: MaterialCategoryPick) {
    const key = materialCategoryKey(item);
    if (selectedKeys.has(key)) {
      remove(item);
      return;
    }
    if (selected.length >= MAX_CATEGORIES) return;
    onChange([
      ...selected,
      { name: item.name, type: 'SYSTEM', categoryId: null, status: 'APPROVED' },
    ]);
  }

  function selectOwned(item: MaterialCategoryPick) {
    const key = materialCategoryKey(item);
    if (selectedKeys.has(key)) {
      remove(item);
      return;
    }
    if (selected.length >= MAX_CATEGORIES) return;
    onChange([
      ...selected,
      {
        name: item.name,
        type: 'CUSTOM',
        categoryId: item.categoryId || null,
        status: item.status || 'APPROVED',
      },
    ]);
  }

  async function addCustom() {
    const display = collapseCategoryName(customName);
    if (!display) {
      setCustomError(t('auth.onboardCategoryRequired'));
      return;
    }
    const systemHit = findSystemCategoryMatch(display, system);
    if (systemHit) {
      setCustomError(t('auth.onboardCategorySystemDuplicate'));
      return;
    }
    const ownedHit = findOwnedCategoryMatch(display, [...owned, ...selected.filter((item) => item.type === 'CUSTOM')]);
    if (ownedHit) {
      setCustomError(t('auth.onboardCategoryCustomDuplicate'));
      return;
    }
    if (selected.length >= MAX_CATEGORIES) return;
    setSaving(true);
    setCustomError('');
    try {
      const { data } = await materialStoreApi.createMaterialCategory(display);
      const created = data.data;
      setOwned((current) => [...current, created]);
      onChange([
        ...selected,
        {
          name: created.name,
          type: 'CUSTOM',
          categoryId: created.categoryId,
          status: created.status || 'APPROVED',
        },
      ]);
      setCustomName('');
      setCustomOpen(false);
    } catch (err) {
      const details = (err as AxiosError<{ details?: { code?: string } }>).response?.data?.details;
      setCustomError(categoryError(details?.code, t) || getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="onboard-services" className="mt-5">
      {loadError ? <p className="mb-3 text-sm text-red-600">{t('auth.onboardCategoryLoadFailed')}</p> : null}
      <div className="flex flex-wrap gap-2">
        {system.map((item) => {
          const active = selectedKeys.has(materialCategoryKey(item));
          return (
            <button
              key={item.name}
              type="button"
              aria-pressed={active}
              onClick={() => selectSystem(item)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-semibold transition',
                active ? 'border-navy-800 bg-navy-800 text-paper-50' : 'border-navy-800/15 bg-white text-navy-800'
              )}
            >
              {categoryDisplayLabel(item, t)}
            </button>
          );
        })}
        {customChips.map((item) => (
          <button
            key={item.categoryId || item.name}
            type="button"
            aria-pressed={false}
            onClick={() => selectOwned(item)}
            className="rounded-full border border-navy-800/15 bg-white px-4 py-2 text-sm font-semibold text-navy-800"
          >
            {item.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setCustomOpen(true);
            setCustomError('');
          }}
          className="rounded-full border border-dashed border-navy-800/30 bg-white px-4 py-2 text-sm font-semibold text-navy-800"
        >
          + {t('auth.onboardOtherService')}
        </button>
      </div>

      {customOpen ? (
        <div className="mt-4 rounded-2xl border border-navy-800/10 bg-paper-50 p-4">
          <p className="text-sm font-semibold text-navy-800">{t('auth.onboardCategoryOtherTitle')}</p>
          <label className="mt-3 block text-sm font-medium text-navy-800">
            {t('auth.onboardCategoryName')}
            <input
              value={customName}
              maxLength={80}
              placeholder={t('auth.onboardCategoryPlaceholder')}
              onChange={(event) => {
                setCustomName(event.target.value);
                if (customError) setCustomError('');
              }}
              className="mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20"
            />
          </label>
          {customError ? <p className="mt-2 text-sm text-red-600">{customError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void addCustom()}
              className="rounded-full bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t('auth.onboardAddCategory')}
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomOpen(false);
                setCustomError('');
              }}
              className="rounded-full border border-navy-800/15 bg-white px-4 py-2 text-sm font-semibold text-navy-800"
            >
              {t('auth.onboardCancelCustom')}
            </button>
          </div>
        </div>
      ) : null}

      {selected.length ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-navy-800">{t('auth.onboardSelectedCategories')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {selected.map((item) => (
              <li
                key={`${item.type}:${item.categoryId || item.name}`}
                className="inline-flex items-center gap-1 rounded-full bg-navy-800 py-1.5 pl-4 pr-2 text-sm font-semibold text-paper-50"
              >
                {categoryDisplayLabel(item, t)}
                <button
                  type="button"
                  aria-label={t('common.remove')}
                  onClick={() => remove(item)}
                  className="grid h-6 w-6 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
