import { api } from '@/lib/api';
import { hasCoordinates } from '@/features/map/lib/location';
import type { MapOrigin } from '@/features/map/types';
import type { LocationSource } from '@/features/map/types';
import type { ApiResponse } from '@/types/user';

export interface AddressSuggestion {
  refId: string;
  name?: string;
  display: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
  distance?: number;
}

export interface PlaceDetail {
  address: string;
  display?: string;
  lat: number;
  lng: number;
  refId?: string;
  ward?: string;
  district?: string;
  city?: string;
  label: string;
}

export interface SearchFocus {
  lat: number;
  lng: number;
}

function asSuggestion(row: AddressSuggestion): AddressSuggestion | null {
  const refId = String(row?.refId || '').trim();
  const display = String(row?.display || row?.name || '').trim();
  if (!refId || !display) return null;
  return {
    refId,
    name: row.name,
    display,
    address: row.address,
    ward: row.ward,
    district: row.district,
    city: row.city,
    distance: Number.isFinite(Number(row.distance)) ? Number(row.distance) : undefined,
  };
}

export function originFromPlace(place: PlaceDetail, source: LocationSource): MapOrigin {
  const address = place.address || place.display || place.label || '';
  return {
    lat: place.lat,
    lng: place.lng,
    label: address,
    address,
    display: place.display || address,
    refId: place.refId,
    ward: place.ward,
    district: place.district,
    city: place.city,
    source,
  };
}

export async function autocompleteAddress(query: string, focus?: SearchFocus | null, signal?: AbortSignal) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const res = await api.get<ApiResponse<AddressSuggestion[]>>('/location/autocomplete', {
    params: {
      q: trimmed,
      focusLat: focus && Number.isFinite(focus.lat) ? focus.lat : undefined,
      focusLng: focus && Number.isFinite(focus.lng) ? focus.lng : undefined,
    },
    silent: true,
    timeout: 12000,
    signal,
  });
  const rows = Array.isArray(res.data.data) ? res.data.data : [];
  return rows.map(asSuggestion).filter((row): row is AddressSuggestion => Boolean(row));
}

export async function placeDetail(refId: string) {
  const res = await api.get<ApiResponse<PlaceDetail>>('/location/place', {
    params: { refId },
    silent: true,
    timeout: 12000,
  });
  const place = res.data.data;
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!hasCoordinates(lat, lng)) {
    throw new Error('missing coordinates');
  }
  return {
    ...place,
    lat,
    lng,
    label: place?.address || place?.display || '',
  };
}

export async function reverseGeocode(lat: number, lng: number) {
  const res = await api.get<ApiResponse<PlaceDetail>>('/location/reverse', {
    params: { lat, lng },
    silent: true,
    timeout: 12000,
  });
  const place = res.data.data;
  return {
    ...place,
    lat: Number(place?.lat ?? lat),
    lng: Number(place?.lng ?? lng),
    label: place?.address || place?.display || '',
  };
}
