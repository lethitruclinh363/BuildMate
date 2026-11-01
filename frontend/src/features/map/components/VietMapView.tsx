import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MapStyleSwitcher } from '@/features/map/components/MapStyleSwitcher';
import { circleFeature } from '@/features/map/lib/circle';
import {
  MAP_STYLE_EVENT,
  mapStyleSpec,
  readMapStyle,
  writeMapStyle,
  type MapStyleType,
} from '@/features/map/lib/map-style';
import { createPinElement, type PinKind } from '@/features/map/lib/pins';
import { vietmapApiKey, vietmapgl } from '@/features/map/lib/vietmap';
import { t } from '@/locales';

export interface VietMapPoint {
  lat: number;
  lng: number;
}

export interface VietMapPlaceMarker extends VietMapPoint {
  id: string;
  kind: 'contractor' | 'store';
  selected?: boolean;
  dimmed?: boolean;
}

type JobMarker = VietMapPoint & { draggable?: boolean };

type GeoSource = { setData: (data: unknown) => void };

function ensureRadius(
  map: vietmapgl.Map,
  radiusKm: number | undefined,
  radiusColor: 'navy' | 'copper',
  center: VietMapPoint
) {
  const paint =
    radiusColor === 'copper'
      ? { fill: '#C9842A', fillOpacity: 0.16, line: '#C9842A' }
      : { fill: '#1E6493', fillOpacity: 0.08, line: '#0B2E4A' };
  if (!map.getSource('bm-radius')) {
    map.addSource('bm-radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer('bm-radius-fill')) {
    map.addLayer({
      id: 'bm-radius-fill',
      type: 'fill',
      source: 'bm-radius',
      paint: { 'fill-color': paint.fill, 'fill-opacity': paint.fillOpacity },
    });
  }
  if (!map.getLayer('bm-radius-line')) {
    map.addLayer({
      id: 'bm-radius-line',
      type: 'line',
      source: 'bm-radius',
      paint: { 'line-color': paint.line, 'line-width': 1.5 },
    });
  }
  const source = map.getSource('bm-radius') as GeoSource | undefined;
  if (!radiusKm || radiusKm <= 0) {
    source?.setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  source?.setData(circleFeature(center.lng, center.lat, radiusKm));
}

class MapGuard extends Component<{ children: ReactNode; className?: string }, { failed: boolean }> {
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
        <div className={`grid place-items-center bg-mist-100 px-4 text-center text-sm text-ink-400 ${this.props.className || 'h-[320px]'}`}>
          {t('map.unavailable')}
        </div>
      );
    }
    return this.props.children;
  }
}

function samePoint(a: VietMapPoint | null | undefined, b: VietMapPoint | null | undefined) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

export function VietMapView({
  center,
  zoom = 14,
  marker,
  radiusKm,
  radiusColor = 'navy',
  markers = [],
  bounds,
  flyToken = 0,
  focus,
  focusToken = 0,
  interactive = true,
  showStyleSwitcher,
  className = 'h-[320px] w-full',
  onMapClick,
  onMarkerDrag,
  onSelectMarker,
  onViewChange,
  callout,
  calloutContent,
}: {
  center: VietMapPoint;
  zoom?: number;
  marker?: JobMarker | null;
  radiusKm?: number;
  radiusColor?: 'navy' | 'copper';
  markers?: VietMapPlaceMarker[];
  bounds?: VietMapPoint[] | null;
  flyToken?: number;
  focus?: VietMapPoint | null;
  focusToken?: number;
  interactive?: boolean;
  showStyleSwitcher?: boolean;
  className?: string;
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerDrag?: (lat: number, lng: number) => void;
  onSelectMarker?: (id: string, kind: 'contractor' | 'store') => void;
  onViewChange?: (point: VietMapPoint) => void;
  callout?: VietMapPoint | null;
  calloutContent?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<vietmapgl.Map | null>(null);
  const jobRef = useRef<vietmapgl.Marker | null>(null);
  const placeRefs = useRef<Map<string, vietmapgl.Marker>>(new Map());
  const popupRef = useRef<vietmapgl.Popup | null>(null);
  const popupKey = useRef('');
  const [popupHost, setPopupHost] = useState<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const readyRef = useRef(false);
  const skipFly = useRef(true);
  const clickRef = useRef(onMapClick);
  const dragRef = useRef(onMarkerDrag);
  const selectRef = useRef(onSelectMarker);
  const viewRef = useRef(onViewChange);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleType>(readMapStyle);
  const styleRef = useRef(mapStyle);
  const styleToken = useRef(0);
  const businessRef = useRef({ radiusKm, radiusColor, center });
  const apiKey = vietmapApiKey();
  const allowSwitcher = showStyleSwitcher ?? interactive;
  businessRef.current = { radiusKm, radiusColor, center };

  clickRef.current = onMapClick;
  dragRef.current = onMarkerDrag;
  selectRef.current = onSelectMarker;
  viewRef.current = onViewChange;

  const applyStyleRef = useRef<(next: MapStyleType, broadcast?: boolean) => void>(() => {});
  applyStyleRef.current = (next, broadcast = true) => {
    if (next === styleRef.current) return;
    styleRef.current = next;
    setMapStyle(next);
    writeMapStyle(next);
    if (broadcast) {
      window.dispatchEvent(new CustomEvent<MapStyleType>(MAP_STYLE_EVENT, { detail: next }));
    }
    const map = mapRef.current;
    const spec = mapStyleSpec(next);
    if (!map || !spec) return;
    const camera = map.getCenter();
    const view = {
      center: [camera.lng, camera.lat] as [number, number],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    const token = styleToken.current + 1;
    styleToken.current = token;
    map.setStyle(spec, { diff: false });
    map.once('style.load', () => {
      if (token !== styleToken.current || mapRef.current !== map) return;
      map.jumpTo(view);
      const business = businessRef.current;
      ensureRadius(map, business.radiusKm, business.radiusColor, business.center);
      jobRef.current?.addTo(map);
      placeRefs.current.forEach((pin) => pin.addTo(map));
      popupRef.current?.addTo(map);
    });
  };

  useEffect(() => {
    function onStyle(event: Event) {
      const next = (event as CustomEvent<MapStyleType>).detail;
      applyStyleRef.current(next, false);
    }
    window.addEventListener(MAP_STYLE_EVENT, onStyle);
    return () => window.removeEventListener(MAP_STYLE_EVENT, onStyle);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const spec = mapStyleSpec(styleRef.current);
    if (!container || !apiKey || !spec) return;
    setFailed(false);
    setReady(false);
    readyRef.current = false;
    skipFly.current = true;
    let map: vietmapgl.Map;
    try {
      map = new vietmapgl.Map({
        container,
        style: spec,
        center: [center.lng, center.lat],
        zoom,
        attributionControl: false,
      });
    } catch (error) {
      console.warn('[BuildMate] map failed', error);
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new vietmapgl.AttributionControl({ compact: true }), 'bottom-left');
    if (!interactive) {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      map.keyboard.disable();
    } else {
      map.addControl(new vietmapgl.NavigationControl({ showCompass: false }), 'top-left');
    }
    const onLoad = () => {
      readyRef.current = true;
      setReady(true);
    };
    let tileLoaded = false;
    let tileFailed = false;
    const onData = (event: { tile?: unknown }) => {
      if (!event?.tile) return;
      tileLoaded = true;
      setFailed(false);
    };
    const onIdle = () => {
      if (tileFailed && !tileLoaded && mapRef.current === map) {
        console.warn('[BuildMate] map tiles failed');
        setFailed(true);
      }
    };
    const onError = (event: { sourceId?: string; tile?: unknown; error?: { name?: string; message?: string } }) => {
      const message = event?.error?.message || '';
      if (event?.error?.name === 'AbortError' || /signal is aborted/i.test(message)) return;
      if (event?.sourceId || event?.tile) {
        tileFailed = true;
        return;
      }
      if (readyRef.current) return;
      console.warn('[BuildMate] map style failed', message || 'style');
      setFailed(true);
    };
    const ignoreAbort = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      const message = String(reason?.message || '');
      if (reason?.name === 'AbortError' || /signal is aborted/i.test(message)) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', ignoreAbort);
    map.on('load', onLoad);
    map.on('data', onData);
    map.on('idle', onIdle);
    map.on('error', onError);
    map.on('click', (event) => {
      const target = (event.originalEvent as { target?: EventTarget } | undefined)?.target;
      if (target instanceof Element && target.closest('.bm-pin, .vietmapgl-popup, .bm-map-popup')) return;
      clickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });
    map.on('moveend', () => {
      const camera = map.getCenter();
      viewRef.current?.({ lat: camera.lat, lng: camera.lng });
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      placeRefs.current.forEach((item) => item.remove());
      placeRefs.current.clear();
      jobRef.current?.remove();
      jobRef.current = null;
      popupRef.current?.remove();
      try {
        map.remove();
      } catch (err: unknown) {
        const error = err as { name?: string; message?: string };
        if (error?.name !== 'AbortError' && !/signal is aborted|aborted/i.test(error?.message || '')) {
          console.warn('[BuildMate] map removal error', err);
        }
      } finally {
        mapRef.current = null;
        readyRef.current = false;
        window.setTimeout(() => window.removeEventListener('unhandledrejection', ignoreAbort), 1000);
      }
    };
    // Map instance stays alive across style changes. setStyle keeps the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (skipFly.current && !flyToken) {
      skipFly.current = false;
      return;
    }
    skipFly.current = false;
    map.flyTo({ center: [center.lng, center.lat], zoom, duration: 700, essential: true });
  }, [ready, center.lat, center.lng, zoom, flyToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusToken || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(zoom, 15), duration: 700, essential: true });
  }, [ready, focusToken, focus?.lat, focus?.lng, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !bounds || bounds.length < 2) return;
    const lngs = bounds.map((point) => point.lng);
    const lats = bounds.map((point) => point.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: zoom, duration: 700 }
    );
  }, [ready, bounds, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ensureRadius(map, radiusKm, radiusColor, center);
  }, [ready, radiusKm, radiusColor, center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!marker) {
      jobRef.current?.remove();
      jobRef.current = null;
      return;
    }
    if (!jobRef.current) {
      const element = createPinElement('job');
      const pin = new vietmapgl.Marker({ element, anchor: 'bottom', draggable: Boolean(marker.draggable) })
        .setLngLat([marker.lng, marker.lat])
        .addTo(map);
      pin.on('dragstart', () => {
        dragging.current = true;
      });
      pin.on('dragend', () => {
        dragging.current = false;
        const point = pin.getLngLat();
        dragRef.current?.(point.lat, point.lng);
      });
      jobRef.current = pin;
      return;
    }
    jobRef.current.setDraggable(Boolean(marker.draggable));
    if (!dragging.current) {
      const current = jobRef.current.getLngLat();
      if (!samePoint({ lat: current.lat, lng: current.lng }, marker)) {
        jobRef.current.setLngLat([marker.lng, marker.lat]);
      }
    }
  }, [ready, marker, marker?.lat, marker?.lng, marker?.draggable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const nextIds = new Set(markers.map((item) => `${item.kind}:${item.id}`));
    placeRefs.current.forEach((pin, key) => {
      if (!nextIds.has(key)) {
        pin.remove();
        placeRefs.current.delete(key);
      }
    });
    markers.forEach((item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
      const key = `${item.kind}:${item.id}`;
      let pin = placeRefs.current.get(key);
      if (!pin) {
        const element = createPinElement(item.kind as PinKind, Boolean(item.selected));
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectRef.current?.(item.id, item.kind);
        });
        pin = new vietmapgl.Marker({ element, anchor: 'bottom' }).setLngLat([item.lng, item.lat]).addTo(map);
        placeRefs.current.set(key, pin);
      } else {
        pin.setLngLat([item.lng, item.lat]);
        const element = pin.getElement();
        element.classList.toggle('bm-pin-selected', Boolean(item.selected));
      }
      pin.getElement().style.opacity = item.dimmed ? '0.45' : '1';
    });
  }, [ready, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!callout || !Number.isFinite(callout.lat) || !Number.isFinite(callout.lng) || !calloutContent) {
      popupRef.current?.remove();
      popupKey.current = '';
      return;
    }
    if (!popupRef.current) {
      const host = document.createElement('div');
      host.className = 'bm-map-callout';
      const popup = new vietmapgl.Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        anchor: 'bottom',
        offset: 28,
        maxWidth: 'none',
        className: 'bm-map-popup',
      });
      popup.setDOMContent(host);
      popupRef.current = popup;
      setPopupHost(host);
    }
    const popup = popupRef.current;
    popup.setLngLat([callout.lng, callout.lat]).addTo(map);
    const key = `${callout.lat.toFixed(6)},${callout.lng.toFixed(6)}`;
    if (popupKey.current === key) return;
    popupKey.current = key;
    window.setTimeout(() => {
      const node = popup.getElement();
      const frame = map.getContainer();
      if (!node || !frame || mapRef.current !== map) return;
      const mapBox = frame.getBoundingClientRect();
      const popBox = node.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (popBox.top < mapBox.top + 8) dy += popBox.top - mapBox.top - 8;
      if (popBox.left < mapBox.left + 8) dx += popBox.left - mapBox.left - 8;
      if (popBox.right > mapBox.right - 8) dx += popBox.right - mapBox.right + 8;
      if (dx || dy) map.panBy([dx, dy], { duration: 280 });
    }, 80);
  }, [ready, callout, calloutContent]);

  if (!apiKey) {
    return (
      <div className={`grid place-items-center bg-mist-100 px-4 text-center text-sm text-ink-400 ${className}`}>
        {t('map.unavailable')}
      </div>
    );
  }

  return (
    <MapGuard className={className}>
      <div className={`relative ${className}`}>
        <div ref={containerRef} className="absolute inset-0" />
        {failed ? (
          <div className="absolute inset-0 grid place-items-center bg-mist-100 px-4 text-center text-sm text-ink-400">
            {t('map.unavailable')}
          </div>
        ) : null}
        {allowSwitcher ? (
          <MapStyleSwitcher value={mapStyle} onChange={(next) => applyStyleRef.current(next)} />
        ) : null}
        {popupHost && calloutContent ? createPortal(calloutContent, popupHost) : null}
      </div>
    </MapGuard>
  );
}
