import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';

export interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

function biasQuery(query: string) {
  const trimmed = query.trim();
  if (/vi[eệ]t nam|vietnam|c[aầ]n th[oơ]|can tho/i.test(trimmed)) return trimmed;
  return `${trimmed}, Cần Thơ, Việt Nam`;
}

export async function geocodeAddress(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const res = await api.get<ApiResponse<GeocodeHit[]>>('/location/geocode', {
    params: { q: biasQuery(trimmed) },
    silent: true,
    timeout: 12000,
  });
  return Array.isArray(res.data.data) ? res.data.data : [];
}

export async function reverseGeocode(lat: number, lng: number) {
  const res = await api.get<ApiResponse<GeocodeHit>>('/location/reverse', {
    params: { lat, lng },
    silent: true,
    timeout: 12000,
  });
  return res.data.data;
}
