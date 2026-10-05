import { Component, type ErrorInfo, type ReactNode } from 'react';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { formatCoordinates } from '@/features/map/lib/location';
import { MAP_TILES } from '@/features/map/lib/tiles';
import { t, useI18n } from '@/locales';
import { MapResize } from './MapResize';
import { SELECTED_PIN } from './Marker';

class MapGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BuildMate] location viewer failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <p className="px-4 py-6 text-sm text-ink-400">{t('map.unavailable')}</p>;
    }
    return this.props.children;
  }
}

export function LocationViewer({
  lat,
  lng,
  address,
  compact = false,
}: {
  lat: number;
  lng: number;
  address?: string;
  compact?: boolean;
}) {
  const { t: tr } = useI18n();
  const ready = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className={compact ? 'overflow-hidden rounded-2xl' : 'overflow-hidden rounded-[22px] border border-navy-800/10 bg-white shadow-card'}>
      {ready ? (
        <MapGuard>
          <MapContainer
            center={[lat, lng]}
            zoom={15}
            className={compact ? 'h-28 w-full' : 'h-52 w-full md:h-64'}
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={!compact}
            attributionControl={!compact}
          >
            <TileLayer attribution={MAP_TILES.attribution} url={MAP_TILES.url} />
            <MapResize />
            <Marker position={[lat, lng]} icon={SELECTED_PIN} />
          </MapContainer>
        </MapGuard>
      ) : (
        <p className="px-4 py-6 text-sm text-ink-400">{tr('map.unavailable')}</p>
      )}
      {compact ? null : (
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-copper-500">{tr('map.selectedAddress')}</p>
          <p className="mt-1 text-sm font-medium text-navy-800">{address || tr('map.emptyAddress')}</p>
          {ready ? (
            <p className="mt-2 text-xs text-ink-400">
              {tr('map.coordinates')}: {formatCoordinates(lat, lng)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
