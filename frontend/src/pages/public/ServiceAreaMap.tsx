import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Circle, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_TILES } from '@/features/map/lib/tiles';
import { t } from '@/locales';

class MapGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BuildMate] service area map failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return <p className="text-sm text-ink-400">{t('map.unavailable')}</p>;
    }
    return this.props.children;
  }
}

/** Vòng tròn khu vực phục vụ, không ghim địa chỉ nhà. */
export function ServiceAreaMap({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  return (
    <MapGuard>
      <MapContainer
        center={[lat, lng]}
        zoom={12}
        className="h-52 w-full rounded-2xl md:h-64"
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={MAP_TILES.url} />
        <Circle
          center={[lat, lng]}
          radius={Math.max(radiusKm, 1) * 1000}
          pathOptions={{ color: '#C9842A', weight: 2, fillColor: '#C9842A', fillOpacity: 0.16 }}
        />
      </MapContainer>
    </MapGuard>
  );
}
