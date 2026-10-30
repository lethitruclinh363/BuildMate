import { SlidersHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';
import { SEARCH_CHIPS } from '@/types/marketplace';

export interface MarketplaceFilters {
  category: string;
  radius: number;
  minRating: number;
  storeType: '' | 'SERVICES' | 'MATERIALS' | 'BOTH';
}

const RATINGS = [0, 3, 4, 4.5];
const RADII = [3, 5, 10];

export function FilterDrawer({
  value,
  onChange,
}: {
  value: MarketplaceFilters;
  onChange: (next: MarketplaceFilters) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const reset = () => {
    const next = { category: '', radius: 5, minRating: 0, storeType: '' as const };
    setDraft(next);
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 shrink-0"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t('filter.open')}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-navy-900/40" onClick={() => setOpen(false)}>
          <aside
            className="h-full w-[min(100vw,380px)] overflow-y-auto bg-paper-50 p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl text-navy-800">{t('filter.title')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs uppercase tracking-[0.18em] text-copper-500">{t('filter.category')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={!draft.category} onClick={() => setDraft((d) => ({ ...d, category: '' }))}>
                {t('filter.any')}
              </Chip>
              {SEARCH_CHIPS.map((chip) => (
                <Chip
                  key={chip.category}
                  active={draft.category === chip.category}
                  onClick={() => setDraft((d) => ({ ...d, category: chip.category }))}
                >
                  {t(chip.labelKey)}
                </Chip>
              ))}
            </div>

            <p className="mt-6 text-xs uppercase tracking-[0.18em] text-copper-500">{t('filter.distance')}</p>
            <div className="mt-2 flex gap-2">
              {RADII.map((km) => (
                <Chip key={km} active={draft.radius === km} onClick={() => setDraft((d) => ({ ...d, radius: km }))}>
                  {km} {t('common.km')}
                </Chip>
              ))}
            </div>

            <p className="mt-6 text-xs uppercase tracking-[0.18em] text-copper-500">{t('filter.rating')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {RATINGS.map((rating) => (
                <Chip
                  key={rating}
                  active={draft.minRating === rating}
                  onClick={() => setDraft((d) => ({ ...d, minRating: rating }))}
                >
                  {rating === 0 ? t('filter.anyRating') : `${rating}+`}
                </Chip>
              ))}
            </div>

            <p className="mt-6 text-xs uppercase tracking-[0.18em] text-copper-500">{t('filter.serviceType')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['', 'SERVICES', 'MATERIALS'] as const).map((type) => (
                <Chip
                  key={type || 'all'}
                  active={draft.storeType === type}
                  onClick={() => setDraft((d) => ({ ...d, storeType: type }))}
                >
                  {type ? t(`storeType.${type}`) : t('filter.allTypes')}
                </Chip>
              ))}
            </div>

            <div className="mt-8 flex gap-2">
              <Button className="flex-1" variant="copper" onClick={apply}>
                {t('filter.apply')}
              </Button>
              <Button variant="outline" onClick={reset}>
                {t('filter.reset')}
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        active ? 'bg-copper-400 text-navy-900' : 'bg-white text-ink-600 shadow-card'
      }`}
    >
      {children}
    </button>
  );
}
