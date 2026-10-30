import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LocateFixed, Navigation } from 'lucide-react';
import { VietMapView, type VietMapPlaceMarker } from '@/features/map/components/VietMapView';
import type { MapOrigin } from '@/features/map/types';
import type { NearbyPlace } from '@/types/marketplace';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

function zoomFor(radiusKm: number) {
  if (radiusKm <= 3) return 14;
  if (radiusKm <= 5) return 13;
  return 12;
}

function pointOf(place: NearbyPlace) {
  const lng = Number(place.location?.coordinates?.[0]);
  const lat = Number(place.location?.coordinates?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function MapView({
  origin,
  radiusKm,
  contractors,
  stores,
  activeId,
  activeKind,
  focus,
  focusToken,
  loading,
  onPick,
  onSelect,
  onGps,
  onViewChange,
  gpsAsking,
  overlay,
  className,
}: {
  origin: MapOrigin;
  radiusKm: number;
  contractors: NearbyPlace[];
  stores: NearbyPlace[];
  activeId?: string;
  activeKind?: 'contractor' | 'store';
  focus?: { lat: number; lng: number } | null;
  focusToken?: number;
  loading?: boolean;
  onPick: (lat: number, lng: number) => void;
  onSelect: (id: string, kind: 'contractor' | 'store') => void;
  onGps?: () => void;
  onViewChange?: (point: { lat: number; lng: number }) => void;
  gpsAsking?: boolean;
  overlay?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [recenter, setRecenter] = useState(0);
  const [streetZoom, setStreetZoom] = useState(false);
  const seenOrigin = useRef(origin);
  useEffect(() => {
    const previous = seenOrigin.current;
    seenOrigin.current = origin;
    const moved = previous.lat !== origin.lat || previous.lng !== origin.lng;
    if (moved && (origin.source === 'VIETMAP_AUTOCOMPLETE' || origin.source === 'VIETMAP_PLACE')) setStreetZoom(true);
  }, [origin]);
  useEffect(() => {
    setStreetZoom(false);
  }, [radiusKm]);
  const empty = !loading && contractors.length === 0 && stores.length === 0;
  const markers = useMemo(() => {
    const pins: VietMapPlaceMarker[] = [];
    contractors.forEach((place) => {
      const point = pointOf(place);
      if (!point) return;
      const selected = activeId === place.id && activeKind !== 'store';
      pins.push({
        id: place.id,
        kind: 'contractor',
        ...point,
        selected,
        dimmed: Boolean(activeId && !selected),
      });
    });
    stores.forEach((place) => {
      const point = pointOf(place);
      if (!point) return;
      const selected = activeId === place.id && activeKind === 'store';
      pins.push({
        id: place.id,
        kind: 'store',
        ...point,
        selected,
        dimmed: Boolean(activeId && !selected),
      });
    });
    return pins;
  }, [contractors, stores, activeId, activeKind]);

  const mapClassName = className || 'h-[320px] w-full sm:h-[460px]';

  return (
    <div className={cn('relative min-h-0', mapClassName)}>
      <VietMapView
        center={origin}
        zoom={streetZoom ? 18 : zoomFor(radiusKm)}
        radiusKm={radiusKm}
        marker={{ lat: origin.lat, lng: origin.lng, draggable: true }}
        markers={markers}
        focus={focus}
        focusToken={focusToken}
        flyToken={recenter}
        className="absolute inset-0 h-full w-full"
        onMapClick={onPick}
        onMarkerDrag={onPick}
        onSelectMarker={onSelect}
        onViewChange={onViewChange}
        callout={activeId && focus ? focus : null}
        calloutContent={overlay}
      />
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
        <button
          type="button"
          aria-label={t('explore.recenter')}
          title={t('explore.recenter')}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white text-navy-800 shadow-card"
          onClick={() => setRecenter((value) => value + 1)}
        >
          <LocateFixed className="h-4 w-4" />
        </button>
        {onGps ? (
          <button
            type="button"
            aria-label={t('explore.useGps')}
            title={t('explore.useGps')}
            disabled={gpsAsking}
            className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-navy-800 px-3 text-xs font-semibold text-paper-50 shadow-card disabled:opacity-60 sm:text-sm"
            onClick={onGps}
          >
            <Navigation className="h-4 w-4" /> {t('explore.useGps')}
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="pointer-events-none absolute left-14 top-3 z-10">
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-navy-800 shadow-card">{t('explore.loadingMap')}</p>
        </div>
      ) : null}
      {empty ? (
        <div className="pointer-events-none absolute inset-x-4 top-16 z-10 sm:inset-x-auto sm:left-4 sm:max-w-sm">
          <p className="rounded-2xl bg-white/95 px-4 py-3 text-sm text-ink-600 shadow-card">{t('explore.mapEmpty')}</p>
        </div>
      ) : null}
    </div>
  );
}
