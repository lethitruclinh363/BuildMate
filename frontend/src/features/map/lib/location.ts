import {
  describePlace,
  directionsUrl as sharedDirectionsUrl,
  fromGeoPoint as sharedFromGeoPoint,
  gpsErrorKind,
  mapSearchUrl as sharedMapSearchUrl,
  requirePlace,
  toGeoPoint as sharedToGeoPoint,
  type GeoPoint,
  type PlacePin,
} from '@buildmate/shared/place';

export type { GeoPoint, PlacePin };

export interface LatLng {
  lat: number;
  lng: number;
}

export type GeoErrorKind = 'denied' | 'unavailable';

export function toGeoPoint(lat: number, lng: number): GeoPoint | null {
  return sharedToGeoPoint(lat, lng);
}

export function fromGeoPoint(point?: { coordinates?: number[] } | null): LatLng | null {
  return sharedFromGeoPoint(point);
}

export function placeFromRecord(source: unknown): PlacePin | null {
  return describePlace(source);
}

const GPS_ORIGIN_KEY = 'buildmate-gps-origin';

export function rememberGpsOrigin(point: LatLng) {
  if (!toGeoPoint(point.lat, point.lng)) return;
  sessionStorage.setItem(GPS_ORIGIN_KEY, JSON.stringify({ lat: point.lat, lng: point.lng }));
}

export function rememberedGpsOrigin(): LatLng | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(GPS_ORIGIN_KEY) || '') as LatLng;
    if (!toGeoPoint(Number(raw?.lat), Number(raw?.lng))) return null;
    return { lat: Number(raw.lat), lng: Number(raw.lng) };
  } catch {
    return null;
  }
}

export function autocompleteFocus(
  origin?: { lat: number; lng: number; source?: string } | null,
  mapCenter?: LatLng | null,
): LatLng | null {
  const gps = rememberedGpsOrigin();
  if (gps) return gps;
  if (origin?.source && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    return { lat: origin.lat, lng: origin.lng };
  }
  if (mapCenter && Number.isFinite(mapCenter.lat) && Number.isFinite(mapCenter.lng)) {
    return { lat: mapCenter.lat, lng: mapCenter.lng };
  }
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    return { lat: origin.lat, lng: origin.lng };
  }
  return null;
}

const SAVED_PLACE_KEY = 'buildmate-saved-place';

export function loadSavedPlace(): PlacePin | null {
  try {
    return describePlace(JSON.parse(localStorage.getItem(SAVED_PLACE_KEY) || ''));
  } catch {
    return null;
  }
}

export function saveSavedPlace(place: { lat: number; lng: number; address?: string; label?: string }) {
  const next = requirePlace(place);
  if (!next) return;
  localStorage.setItem(
    SAVED_PLACE_KEY,
    JSON.stringify({ lat: next.lat, lng: next.lng, address: next.address, label: next.label || next.address })
  );
}

export function directionsUrl(lat: number, lng: number, origin?: LatLng | null) {
  return sharedDirectionsUrl(lat, lng, origin);
}

export function openGoogleMapsDirections(lat: number, lng: number, origin?: LatLng | null) {
  const url = directionsUrl(lat, lng, origin);
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}

export function mapSearchUrl(lat: number, lng: number) {
  return sharedMapSearchUrl(lat, lng);
}

export function persistedLocationSource(source?: string) {
  if (source === 'GPS') return 'GPS' as const;
  if (source === 'VIETMAP_PLACE' || source === 'VIETMAP_AUTOCOMPLETE') return 'VIETMAP_PLACE' as const;
  return 'MANUAL_PIN' as const;
}

export function storeLocationPatch(origin: {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  city?: string;
  source?: string;
  refId?: string;
  locationConfirmed?: boolean;
}) {
  const address = (origin.address || origin.label || '').trim();
  const city = (origin.city || '').trim();
  return {
    lat: origin.lat,
    lng: origin.lng,
    locationConfirmed: origin.locationConfirmed === true,
    locationSource: persistedLocationSource(origin.source),
    ...(origin.refId ? { providerRefId: origin.refId } : {}),
    ...(address.length >= 4 ? { address: address.slice(0, 200) } : {}),
    ...(city ? { city: city.slice(0, 80) } : {}),
  };
}

export function formatCoordinates(lat: number, lng: number, digits = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

export function requestCurrentPosition() {
  return new Promise<LatLng>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('unavailable'), { kind: 'unavailable' as GeoErrorKind }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const kind: GeoErrorKind = gpsErrorKind(err.code);
        reject(Object.assign(new Error(kind), { kind }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  });
}
