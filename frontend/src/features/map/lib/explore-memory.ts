import type { MarketplaceFilters } from '@/features/map/components/FilterDrawer';
import type { MapOrigin } from '@/features/map/types';

const KEY = 'buildmate.explore';

export type ExploreSnapshot = {
  origin: MapOrigin;
  filters: MarketplaceFilters;
  mapCenter: { lat: number; lng: number } | null;
};

let memory: ExploreSnapshot | null = null;

function valid(value: ExploreSnapshot | null): value is ExploreSnapshot {
  return Boolean(
    value &&
      Number.isFinite(value.origin?.lat) &&
      Number.isFinite(value.origin?.lng) &&
      Number.isFinite(value.filters?.radius)
  );
}

export function rememberExplore(next: ExploreSnapshot) {
  memory = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function readExplore(): ExploreSnapshot | null {
  if (valid(memory)) return memory;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || 'null') as ExploreSnapshot | null;
    if (!valid(parsed)) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}
