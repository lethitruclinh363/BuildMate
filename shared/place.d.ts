export interface PlacePin {
  lat: number;
  lng: number;
  address: string;
  label: string;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export function cleanPlaceText(value: unknown, max: number): string;
export function toGeoPoint(lat: number, lng: number): GeoPoint | null;
export function hasCoordinates(lat: unknown, lng: unknown): boolean;
export function fromGeoPoint(point?: { coordinates?: number[] } | null): { lat: number; lng: number } | null;
export function requirePlace(
  input: unknown,
  limits?: { addressMax?: number; labelMax?: number }
): (PlacePin & { point: GeoPoint }) | null;
export function describePlace(source: unknown): PlacePin | null;
export function directionsUrl(lat: number, lng: number, origin?: { lat: number; lng: number } | null): string;
export function mapSearchUrl(lat: number, lng: number): string;
export function gpsErrorKind(code: number): 'denied' | 'unavailable';
