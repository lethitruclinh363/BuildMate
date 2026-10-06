export type LocationSource = 'VIETMAP_PLACE' | 'VIETMAP_AUTOCOMPLETE' | 'GPS' | 'MANUAL_PIN' | 'MAP_PIN';

/** Normalized place shared by customer, contractor, and material store flows. */
export interface SelectedLocation {
  address: string;
  display?: string;
  lat: number;
  lng: number;
  refId?: string;
  ward?: string;
  district?: string;
  city?: string;
  source: LocationSource;
}

export interface MapOrigin {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  display?: string;
  refId?: string;
  ward?: string;
  district?: string;
  city?: string;
  source?: LocationSource;
  locationConfirmed?: boolean;
  locationConfirmedAt?: string;
}

export function toSelectedLocation(origin: MapOrigin | null | undefined): SelectedLocation | null {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;
  const address = (origin.address || origin.display || origin.label || '').trim();
  if (!address) return null;
  return {
    address,
    display: origin.display || address,
    lat: origin.lat,
    lng: origin.lng,
    refId: origin.refId,
    ward: origin.ward,
    district: origin.district,
    city: origin.city,
    source: origin.source || 'MAP_PIN',
  };
}
