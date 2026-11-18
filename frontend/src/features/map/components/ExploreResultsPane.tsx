import { useMemo } from 'react';
import { NearbyCard } from '@/features/map/components/NearbyCard';
import type { MaterialStoreMatchSummary } from '@/features/map/components/MaterialStoreCard';
import { RadiusSelector } from '@/features/map/components/RadiusSelector';
import type { LatLng } from '@/features/map/lib/location';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { NearbyPlace } from '@/types/marketplace';

export type ExploreListTab = 'all' | 'contractor' | 'store';

function metersOf(place: NearbyPlace) {
  const value = place.distanceMeters ?? place.distance * 1000;
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export function ExploreResultsPane({
  contractors,
  stores,
  pick,
  onChoose,
  radiusKm,
  emptyCrewsTitle,
  emptyCrewsBody,
  emptyStoresTitle,
  emptyStoresBody,
  tab,
  onTabChange,
  onRadiusChange,
  origin,
  materialMatches,
}: {
  contractors: NearbyPlace[];
  stores: NearbyPlace[];
  pick: { id: string; kind: 'contractor' | 'store' } | null;
  onChoose: (id: string, kind: 'contractor' | 'store') => void;
  radiusKm: number;
  emptyCrewsTitle: string;
  emptyCrewsBody: string;
  emptyStoresTitle: string;
  emptyStoresBody: string;
  tab: ExploreListTab;
  onTabChange: (tab: ExploreListTab) => void;
  onRadiusChange: (km: number) => void;
  origin?: LatLng | null;
  materialMatches?: Record<string, MaterialStoreMatchSummary>;
}) {
  const { t } = useI18n();

  const crews = useMemo(
    () => contractors.map((place) => ({ place, kind: 'contractor' as const })),
    [contractors]
  );
  const yards = useMemo(
    () => stores.map((place) => ({ place, kind: 'store' as const })),
    [stores]
  );
  const mixed = useMemo(
    () => [...crews, ...yards].sort((a, b) => metersOf(a.place) - metersOf(b.place)),
    [crews, yards]
  );

  const items = tab === 'contractor' ? crews : tab === 'store' ? yards : mixed;
  const visibleCount = tab === 'contractor' ? crews.length : tab === 'store' ? yards.length : mixed.length;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base leading-tight text-navy-800 sm:text-lg">{t('explore.nearbyResults')}</h2>
          <RadiusSelector value={radiusKm} onChange={onRadiusChange} />
        </div>
        <p className="mt-1 text-[11px] leading-4 text-ink-500 sm:text-xs">
          {t('explore.resultsInRadius', { n: visibleCount, km: radiusKm })}
        </p>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        <TabChip active={tab === 'all'} onClick={() => onTabChange('all')}>
          {t('explore.tabAll')}
        </TabChip>
        <TabChip active={tab === 'contractor'} onClick={() => onTabChange('contractor')}>
          {t('explore.contractor')}
        </TabChip>
        <TabChip active={tab === 'store'} onClick={() => onTabChange('store')}>
          {t('explore.store')}
        </TabChip>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col gap-3">
          {tab !== 'store' ? <CompactEmpty title={emptyCrewsTitle} body={emptyCrewsBody} /> : null}
          {tab !== 'contractor' ? <CompactEmpty title={emptyStoresTitle} body={emptyStoresBody} /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(({ place, kind }) => (
            <NearbyCard
              key={`${kind}-${place.id}`}
              place={place}
              kind={kind}
              active={pick?.kind === kind && pick.id === place.id}
              onHover={() => onChoose(place.id, kind)}
              origin={origin}
              requirementMatch={kind === 'store' ? materialMatches?.[String(place.id)] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="h-[120px] animate-pulse rounded-[12px] bg-white p-2.5 shadow-card" aria-hidden>
      <div className="flex gap-2.5">
        <div className="h-10 w-10 rounded-lg bg-navy-800/10" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="h-5 w-36 rounded bg-navy-800/10" />
          <div className="h-4 w-48 rounded bg-navy-800/10" />
        </div>
      </div>
      <div className="mt-2 h-3 w-40 rounded bg-navy-800/10" />
      <div className="mt-2 flex gap-1">
        <div className="h-8 w-24 rounded-full bg-navy-800/10" />
        <div className="h-8 w-28 rounded-full bg-navy-800/10" />
      </div>
    </div>
  );
}

export function CompactEmpty({
  title,
  body,
  action,
  actionLabel,
}: {
  title: string;
  body?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[112px] max-h-[140px] flex-col justify-center rounded-[22px] border border-navy-800/8 bg-white px-6 py-4 shadow-card">
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {body ? <p className="mt-1 text-sm leading-6 text-ink-500">{body}</p> : null}
      {action && actionLabel ? (
        <button type="button" className="mt-2 w-fit text-sm font-semibold text-navy-800 underline" onClick={action}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-full px-2.5 py-1 text-xs font-semibold transition sm:text-sm lg:min-h-8',
        active ? 'bg-copper-400 text-navy-900' : 'bg-white text-ink-600 shadow-card'
      )}
    >
      {children}
    </button>
  );
}
