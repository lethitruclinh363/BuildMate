import type { StyleSpecification } from '@vietmap/vietmap-gl-js/dist/vietmap-gl';
import { vietmapApiKey } from '@/features/map/lib/vietmap';

export type MapStyleType = 'STANDARD' | 'SATELLITE' | 'HYBRID';

export const MAP_STYLE_STORAGE_KEY = 'buildmate.mapStyle';
export const MAP_STYLE_EVENT = 'buildmate-map-style';

const KNOWN: MapStyleType[] = ['STANDARD', 'SATELLITE', 'HYBRID'];

export function readMapStyle(): MapStyleType {
  try {
    const value = localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    if (value === 'STANDARD' || value === 'SATELLITE' || value === 'HYBRID') return value;
  } catch {
    /* Private browsing can block storage. */
  }
  return 'STANDARD';
}

export function writeMapStyle(style: MapStyleType) {
  if (!KNOWN.includes(style)) return;
  try {
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, style);
  } catch {
    /* Preference is optional. */
  }
}

export function mapStyleSpec(style: MapStyleType): string | StyleSpecification | '' {
  const key = vietmapApiKey();
  if (!key) return '';
  const token = encodeURIComponent(key);
  if (style === 'HYBRID') {
    return `https://maps.vietmap.vn/maps/styles/hm/style.json?apikey=${token}`;
  }
  if (style === 'SATELLITE') {
    const satellite: StyleSpecification = {
      version: 8,
      sources: {
        vietmapSatellite: {
          type: 'raster',
          tiles: [`https://maps.vietmap.vn/maps/tiles/st/{z}/{x}/{y}.png?apikey=${token}`],
          tileSize: 256,
          attribution: '© VietMap',
        },
      },
      layers: [
        {
          id: 'vietmap-satellite',
          type: 'raster',
          source: 'vietmapSatellite',
        },
      ],
    };
    return satellite;
  }
  return `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${token}`;
}
