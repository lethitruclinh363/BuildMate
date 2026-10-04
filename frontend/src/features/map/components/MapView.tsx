import { Component, useEffect, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Navigation } from 'lucide-react';
import { MAP_TILES } from '@/features/map/lib/tiles';
import type { NearbyPlace } from '@/types/marketplace';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { t, useI18n } from '@/locales';
import { CONTRACTOR_PIN, JOB_SITE_PIN, PlaceMarker, STORE_PIN, makePin } from './Marker';

const PERSON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const SHOP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 9 5 4h14l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/></svg>';

function zoomFor(radiusKm: number) {
  if (radiusKm <= 3) return 14;
  if (radiusKm <= 5) return 13;
  return 12;
}

function FlyTo({
  origin,
  radiusKm,
  focus,
  focusToken,
}: {
  origin: MapOrigin;
  radiusKm: number;
  focus?: { lat: number; lng: number } | null;
  focusToken?: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([origin.lat, origin.lng], zoomFor(radiusKm), { duration: 0.65 });
  }, [origin.lat, origin.lng, radiusKm, map]);
  useEffect(() => {
    if (!focus || !focusToken) return;
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.7 });
  }, [focusToken, focus?.lat, focus?.lng, map]);
  return null;
}

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function MapTools({
  origin,
  radiusKm,
  onGps,
  asking,
  gpsLabel,
  recenterLabel,
}: {
  origin: MapOrigin;
  radiusKm: number;
  onGps?: () => void;
  asking?: boolean;
  gpsLabel: string;
  recenterLabel: string;
}) {
  const map = useMap();
  const keep = (node: HTMLButtonElement | null) => {
    if (node) L.DomEvent.disableClickPropagation(node);
  };
  return (
    <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
      <button
        type="button"
        ref={keep}
        aria-label={recenterLabel}
        title={recenterLabel}
        className="grid h-11 w-11 place-items-center rounded-full bg-white text-navy-800 shadow-card"
        onClick={() => map.flyTo([origin.lat, origin.lng], zoomFor(radiusKm), { duration: 0.65 })}
      >
        <LocateFixed className="h-5 w-5" />
      </button>
      {onGps ? (
        <button
          type="button"
          ref={keep}
          aria-label={gpsLabel}
          title={gpsLabel}
          disabled={asking}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-navy-800 px-4 text-sm font-semibold text-paper-50 shadow-card disabled:opacity-60"
          onClick={onGps}
        >
          <Navigation className="h-4 w-4" /> {gpsLabel}
        </button>
      ) : null}
    </div>
  );
}

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BuildMate] map failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid h-[320px] w-full place-items-center rounded-[22px] border border-navy-800/10 bg-mist-100 px-4 text-center text-sm text-ink-400 sm:h-[460px]">
          {t('map.unavailable')}
        </div>
      );
    }
    return this.props.children;
  }
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
  gpsAsking,
  overlay,
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
  gpsAsking?: boolean;
  overlay?: ReactNode;
}) {
  const { t: tr } = useI18n();
  const selectedContractor = useMemo(() => makePin('#C9842A', PERSON, true), []);
  const selectedStore = useMemo(() => makePin('#D4A017', SHOP, true), []);
  const empty = !loading && contractors.length === 0 && stores.length === 0;

  return (
<<<<<<< HEAD
    <MapErrorBoundary>
      <MapContainer
        center={[origin.lat, origin.lng]}
        zoom={zoom}
        className="h-[420px] w-full rounded-[22px] md:h-[520px]"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter origin={origin} zoom={zoom} />
        <ClickToPin onPick={onPick} />
        <Circle
=======
    <div className="relative">
      <MapErrorBoundary>
        <MapContainer
>>>>>>> origin/Duc
          center={[origin.lat, origin.lng]}
          zoom={zoomFor(radiusKm)}
          className="h-[320px] w-full sm:h-[460px]"
          scrollWheelZoom
        >
          <TileLayer attribution={MAP_TILES.attribution} url={MAP_TILES.url} />
          <FlyTo origin={origin} radiusKm={radiusKm} focus={focus} focusToken={focusToken} />
          <ClickToPin onPick={onPick} />
          <Circle
            center={[origin.lat, origin.lng]}
            radius={radiusKm * 1000}
            pathOptions={{ color: '#0B2E4A', fillColor: '#1E6493', fillOpacity: 0.08, weight: 1.5 }}
          />
          <Marker position={[origin.lat, origin.lng]} icon={JOB_SITE_PIN} zIndexOffset={400} />
          {contractors.map((place) => {
            const selected = activeId === place.id && activeKind !== 'store';
            return (
            <PlaceMarker
              key={`c-${place.id}`}
              place={place}
              icon={selected ? selectedContractor : CONTRACTOR_PIN}
              selected={selected}
              dimmed={Boolean(activeId && !selected)}
              onSelect={() => onSelect(place.id, 'contractor')}
            />
            );
          })}
          {stores.map((place) => {
            const selected = activeId === place.id && activeKind === 'store';
            return (
            <PlaceMarker
              key={`s-${place.id}`}
              place={place}
              icon={selected ? selectedStore : STORE_PIN}
              selected={selected}
              dimmed={Boolean(activeId && !selected)}
              onSelect={() => onSelect(place.id, 'store')}
            />
            );
          })}
          <MapTools
            origin={origin}
            radiusKm={radiusKm}
            onGps={onGps}
            asking={gpsAsking}
            gpsLabel={tr('explore.useGps')}
            recenterLabel={tr('explore.recenter')}
          />
        </MapContainer>
      </MapErrorBoundary>
      {loading ? (
        <div className="pointer-events-none absolute left-14 top-3 z-[500]">
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-navy-800 shadow-card">{tr('explore.loadingMap')}</p>
        </div>
      ) : null}
      {empty ? (
        <div className="pointer-events-none absolute inset-x-4 top-16 z-[500] sm:inset-x-auto sm:left-4 sm:max-w-sm">
          <p className="rounded-2xl bg-white/95 px-4 py-3 text-sm text-ink-600 shadow-card">{tr('explore.mapEmpty')}</p>
        </div>
      ) : null}
      {overlay}
    </div>
  );
}
