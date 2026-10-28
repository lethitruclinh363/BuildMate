import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { vietmapApiKey, vietmapgl, vietmapStyleUrl } from '@/lib/vietmap';

export interface AdminMapPoint {
  lat: number;
  lng: number;
}

const PERSON_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

const SHOP_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 9 5 4h14l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/></svg>';

function createMarkerElement(kind: 'contractor' | 'store') {
  const el = document.createElement('div');
  el.className = 'bm-admin-pin';
  el.style.display = 'grid';
  el.style.placeItems = 'center';
  el.style.width = '34px';
  el.style.height = '34px';
  el.style.borderRadius = '999px';
  el.style.color = '#ffffff';
  el.style.backgroundColor = kind === 'contractor' ? '#173B4F' : '#D4A017';
  el.style.border = '2.5px solid #ffffff';
  el.style.boxShadow = '0 6px 16px rgba(15, 23, 42, 0.35)';
  el.style.cursor = 'default';
  el.innerHTML = kind === 'contractor' ? PERSON_ICON : SHOP_ICON;
  return el;
}

class MapGuard extends Component<{ children: ReactNode; fallbackText?: string; className?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[BuildMate Admin] map failed to render', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={`grid place-items-center bg-[#F1F5F9] px-4 text-center text-sm text-[#7E92A2] ${this.props.className || 'h-[280px]'}`}>
          {this.props.fallbackText || 'Bản đồ tạm thời không khả dụng.'}
        </div>
      );
    }
    return this.props.children;
  }
}

export function AdminVietMapView({
  center,
  zoom = 15,
  actorKind = 'contractor',
  address,
  fallbackText = 'Không thể tải bản đồ lúc này.',
  className = 'h-[280px] w-full',
}: {
  center: AdminMapPoint;
  zoom?: number;
  actorKind?: 'contractor' | 'store';
  address?: string;
  fallbackText?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<vietmapgl.Map | null>(null);
  const markerRef = useRef<vietmapgl.Marker | null>(null);
  const readyRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const apiKey = vietmapApiKey();

  useEffect(() => {
    const container = containerRef.current;
    const styleUrl = vietmapStyleUrl();
    if (!container || !apiKey || !styleUrl) {
      if (!apiKey) setFailed(true);
      return;
    }

    setFailed(false);
    setReady(false);
    readyRef.current = false;

    let map: vietmapgl.Map;
    try {
      map = new vietmapgl.Map({
        container,
        style: styleUrl,
        center: [center.lng, center.lat],
        zoom,
        attributionControl: false,
      });
    } catch (err) {
      console.warn('[BuildMate Admin] map init failed', err);
      setFailed(true);
      return;
    }

    mapRef.current = map;
    map.addControl(new vietmapgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new vietmapgl.NavigationControl({ showCompass: false }), 'top-left');

    const onLoad = () => {
      readyRef.current = true;
      setReady(true);

      // Create strictly read-only non-draggable marker
      const el = createMarkerElement(actorKind);
      const marker = new vietmapgl.Marker({ element: el, anchor: 'bottom', draggable: false })
        .setLngLat([center.lng, center.lat])
        .addTo(map);

      if (address) {
        const popup = new vietmapgl.Popup({ offset: 25, closeButton: false }).setText(address);
        marker.setPopup(popup);
      }

      markerRef.current = marker;
    };

    const onError = (event: { sourceId?: string; tile?: unknown; error?: { message?: string } }) => {
      const msg = event?.error?.message || '';
      if (/signal is aborted/i.test(msg) || /canceled/i.test(msg)) return;
      if (!readyRef.current && (event?.sourceId || !event?.tile)) {
        console.warn('[BuildMate Admin] map error', msg);
      }
    };

    map.on('load', onLoad);
    map.on('error', onError);

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Update camera and marker position when center changes (e.g. Admin selects another profile)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    map.flyTo({
      center: [center.lng, center.lat],
      zoom: Math.max(zoom, 15),
      duration: 600,
      essential: true,
    });

    if (markerRef.current) {
      markerRef.current.setLngLat([center.lng, center.lat]);
      if (address) {
        const popup = new vietmapgl.Popup({ offset: 25, closeButton: false }).setText(address);
        markerRef.current.setPopup(popup);
      }
    }
  }, [ready, center.lat, center.lng, zoom, address]);

  if (failed || !apiKey) {
    return (
      <div className={`grid place-items-center rounded-xl bg-[#F8FAFC] border border-[#E1E7ED] px-4 text-center text-sm text-[#7E92A2] ${className}`}>
        {fallbackText}
      </div>
    );
  }

  return (
    <MapGuard fallbackText={fallbackText} className={className}>
      <div ref={containerRef} className={className} />
    </MapGuard>
  );
}
