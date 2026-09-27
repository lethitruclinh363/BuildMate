import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { NearbyPlace } from '@/types/marketplace';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { t, useI18n } from '@/locales';
import { CONTRACTOR_PIN, JOB_SITE_PIN, PlaceMarker, STORE_PIN } from './Marker';

function Recenter({ origin, zoom }: { origin: MapOrigin; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([origin.lat, origin.lng], zoom);
  }, [origin.lat, origin.lng, zoom, map]);
  return null;
}

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
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
        <div className="grid h-[420px] w-full place-items-center rounded-[22px] border border-navy-800/10 bg-mist-100 text-sm text-ink-400 md:h-[520px]">
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
  onPick,
  onSelect,
}: {
  origin: MapOrigin;
  radiusKm: number;
  contractors: NearbyPlace[];
  stores: NearbyPlace[];
  activeId?: string;
  onPick: (lat: number, lng: number) => void;
  onSelect: (id: string) => void;
}) {
  useI18n();
  const zoom = radiusKm <= 3 ? 14 : radiusKm <= 5 ? 13 : 12;
  const storeOnly = stores.filter((s) => !contractors.some((c) => c.id === s.id));

  return (
    <MapErrorBoundary>
      <MapContainer
        center={[origin.lat, origin.lng]}
        zoom={zoom}
        className="h-[420px] w-full rounded-[22px] md:h-[520px]"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap, &copy; CARTO'
          url="https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
        />
        <Recenter origin={origin} zoom={zoom} />
        <ClickToPin onPick={onPick} />
        <Circle
          center={[origin.lat, origin.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: '#0B2E4A', fillColor: '#1E6493', fillOpacity: 0.08, weight: 1.5 }}
        />
        <Marker position={[origin.lat, origin.lng]} icon={JOB_SITE_PIN} />
        {contractors.map((p) => (
          <PlaceMarker
            key={`c-${p.id}`}
            place={p}
            icon={CONTRACTOR_PIN}
            dimmed={Boolean(activeId && activeId !== p.id)}
            onSelect={onSelect}
          />
        ))}
        {storeOnly.map((p) => (
          <PlaceMarker
            key={`s-${p.id}`}
            place={p}
            icon={STORE_PIN}
            dimmed={Boolean(activeId && activeId !== p.id)}
            onSelect={onSelect}
          />
        ))}
      </MapContainer>
    </MapErrorBoundary>
  );
}
