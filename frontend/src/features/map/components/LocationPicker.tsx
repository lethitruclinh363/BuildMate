import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { formatCoordinates, rememberGpsOrigin, requestCurrentPosition, type GeoErrorKind } from '@/features/map/lib/location';
import { MAP_TILES } from '@/features/map/lib/tiles';
import { geocodeAddress, reverseGeocode, type GeocodeHit } from '@/features/map/services/geocoding';
import { t, useI18n } from '@/locales';
import { MapResize } from './MapResize';
import { SELECTED_PIN } from './Marker';

class MapGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BuildMate] location picker failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid h-[280px] w-full place-items-center bg-mist-100 px-4 text-center text-sm text-ink-400 md:h-[340px]">
          {t('map.unavailable')}
        </div>
      );
    }
    return this.props.children;
  }
}

function FollowPin({ origin }: { origin: MapOrigin }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    const view: [number, number] = [origin.lat, origin.lng];
    if (first.current) {
      first.current = false;
      map.setView(view, Math.max(map.getZoom(), 15));
      return;
    }
    map.flyTo(view, Math.max(map.getZoom(), 15), { duration: 0.7 });
  }, [origin.lat, origin.lng, map]);
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
  locating,
  onLocate,
  locateLabel,
  recenterLabel,
}: {
  origin: MapOrigin;
  locating: boolean;
  onLocate: () => void;
  locateLabel: string;
  recenterLabel: string;
}) {
  const map = useMap();
  const keepClick = useCallback((node: HTMLButtonElement | null) => {
    if (node) L.DomEvent.disableClickPropagation(node);
  }, []);
  return (
    <div className="absolute bottom-12 right-3 z-[500] flex flex-col gap-2">
      <button
        type="button"
        aria-label={recenterLabel}
        title={recenterLabel}
        ref={keepClick}
        className="grid h-11 w-11 place-items-center rounded-full bg-white text-navy-800 shadow-card"
        onClick={() => map.setView([origin.lat, origin.lng], Math.max(map.getZoom(), 15))}
      >
        <LocateFixed className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label={locateLabel}
        title={locateLabel}
        disabled={locating}
        ref={keepClick}
        className="grid h-11 w-11 place-items-center rounded-full bg-navy-800 text-paper-50 shadow-card disabled:opacity-60"
        onClick={onLocate}
      >
        <Navigation className="h-5 w-5" />
      </button>
    </div>
  );
}

export function LocationPicker({
  origin,
  onPick,
  onGps,
  gpsStatus,
  variant = 'inline',
  onSave,
  onCancel,
}: {
  origin: MapOrigin;
  onPick: (origin: MapOrigin) => void;
  onGps?: () => void;
  gpsStatus?: string;
  variant?: 'inline' | 'panel';
  onSave?: (origin: MapOrigin) => void;
  onCancel?: () => void;
}) {
  const { t: tr } = useI18n();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [notice, setNotice] = useState('');
  const [gpsError, setGpsError] = useState<GeoErrorKind | ''>('');

  const gpsMessage =
    gpsError === 'denied' || gpsStatus === 'denied'
      ? tr('map.gpsDenied')
      : gpsError === 'unavailable' || gpsStatus === 'unavailable'
        ? tr('map.gpsUnavailable')
        : '';

  async function search() {
    if (query.trim().length < 3) return;
    setSearching(true);
    setNotice('');
    try {
      const data = await geocodeAddress(query);
      setHits(data);
      if (!data.length) setNotice(tr('map.noResults'));
    } catch {
      setHits([]);
      setNotice(tr('map.searchFailed'));
    } finally {
      setSearching(false);
    }
  }

  function choose(hit: GeocodeHit) {
    onPick({ lat: hit.lat, lng: hit.lng, label: hit.label });
    setQuery(hit.label);
    setHits([]);
    setNotice('');
  }

  async function pinAt(lat: number, lng: number) {
    setReversing(true);
    setNotice('');
    try {
      const hit = await reverseGeocode(lat, lng);
      onPick({ lat, lng, label: hit?.label || undefined });
      if (hit?.label) setQuery(hit.label);
      if (!hit?.label) setNotice(tr('map.reverseFailed'));
    } catch {
      onPick({ lat, lng });
      setNotice(tr('map.reverseFailed'));
    } finally {
      setReversing(false);
    }
  }

  async function useCurrent() {
    if (variant === 'inline' && onGps) {
      onGps();
      return;
    }
    setLocating(true);
    setGpsError('');
    setNotice('');
    try {
      const point = await requestCurrentPosition();
      rememberGpsOrigin(point);
      setLocating(false);
      await pinAt(point.lat, point.lng);
    } catch (err) {
      const kind = (err as { kind?: GeoErrorKind }).kind;
      setGpsError(kind === 'denied' ? 'denied' : 'unavailable');
    } finally {
      setLocating(false);
    }
  }

  const searchRow = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex-1">
        <Input
          id="site-address"
          placeholder={tr('map.addressPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
        />
      </div>
      <Button type="button" variant="outline" loading={searching} onClick={() => void search()}>
        {tr('common.find')}
      </Button>
      {variant === 'inline' ? (
        <Button type="button" variant="copper" loading={gpsStatus === 'asking'} onClick={() => void useCurrent()}>
          <Navigation className="h-4 w-4" /> {tr('map.useCurrent')}
        </Button>
      ) : null}
    </div>
  );

  const hitsList = hits.length ? (
    <ul className="overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
      {hits.map((hit) => (
        <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
          <button type="button" className="w-full px-4 py-2 text-left text-sm hover:bg-paper-100" onClick={() => choose(hit)}>
            {hit.label}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  if (variant === 'inline') {
    return (
      <div className="space-y-3">
        {searchRow}
        <p className="inline-flex items-center gap-1 text-xs text-ink-400">
          <MapPin className="h-3.5 w-3.5" />
          {tr('map.pin', { lat: origin.lat.toFixed(5), lng: origin.lng.toFixed(5) })}
          {origin.label ? ` · ${origin.label}` : ''}
          {gpsMessage ? ` · ${gpsMessage}` : ''}
          {` · ${tr('map.clickMap')}`}
        </p>
        {notice ? <p className="text-sm text-red-700">{notice}</p> : null}
        {searching ? <p className="text-sm text-ink-500">{tr('map.searching')}</p> : null}
        {hitsList}
      </div>
    );
  }

  const busy = locating || reversing || searching;

  return (
    <div className="overflow-hidden rounded-[22px] border border-navy-800/10 bg-white shadow-card">
      <MapGuard>
        <div className="relative">
          <MapContainer
            center={[origin.lat, origin.lng]}
            zoom={15}
            className="h-[280px] w-full md:h-[340px]"
            scrollWheelZoom
          >
            <TileLayer attribution={MAP_TILES.attribution} url={MAP_TILES.url} />
            <MapResize />
            <FollowPin origin={origin} />
            <ClickToPin onPick={(lat, lng) => void pinAt(lat, lng)} />
            <Marker
              position={[origin.lat, origin.lng]}
              icon={SELECTED_PIN}
              draggable
              eventHandlers={{
                dragend(event) {
                  const point = event.target.getLatLng();
                  void pinAt(point.lat, point.lng);
                },
              }}
            />
            <MapTools
              origin={origin}
              locating={locating}
              onLocate={() => void useCurrent()}
              locateLabel={tr('map.useCurrent')}
              recenterLabel={tr('map.recenter')}
            />
          </MapContainer>
          {busy ? (
            <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy-800 shadow-card">
              {locating ? tr('map.locating') : reversing ? tr('map.reversing') : tr('map.searching')}
            </div>
          ) : null}
        </div>
      </MapGuard>
      <div className="space-y-3 p-4">
        {searchRow}
        {hitsList}
        <div className="rounded-2xl bg-paper-100 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-copper-500">{tr('map.selectedAddress')}</p>
          <p className="mt-1 text-sm font-medium text-navy-800">{origin.label || tr('map.emptyAddress')}</p>
          <p className="mt-2 text-xs text-ink-400">
            {tr('map.coordinates')}: {formatCoordinates(origin.lat, origin.lng)}
          </p>
          <p className="mt-1 text-xs text-ink-400">{tr('map.dragPin')}</p>
        </div>
        {gpsMessage ? <p className="text-sm text-red-700">{gpsMessage}</p> : null}
        {notice ? <p className="text-sm text-red-700">{notice}</p> : null}
        {onSave || onCancel ? (
          <div className="flex justify-end gap-2">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                {tr('common.cancel')}
              </Button>
            ) : null}
            {onSave ? (
              <Button type="button" disabled={busy} onClick={() => onSave(origin)}>
                {tr('map.save')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
