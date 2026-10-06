import '@vietmap/vietmap-gl-js/dist/vietmap-gl.css';
import * as vietmapNamespace from '@vietmap/vietmap-gl-js/dist/vietmap-gl';

type VietMapApi = typeof vietmapNamespace;

function bindVietMap(mod: VietMapApi) {
  const candidate = mod as VietMapApi & { default?: VietMapApi };
  if (typeof candidate.Map === 'function') return candidate;
  if (candidate.default && typeof candidate.default.Map === 'function') return candidate.default;
  return candidate;
}

export const vietmapgl = bindVietMap(vietmapNamespace);

export function vietmapApiKey() {
  return String(import.meta.env.VITE_VIETMAP_API_KEY || '').trim();
}

export function vietmapStyleUrl() {
  const key = vietmapApiKey();
  if (!key) return '';
  return `https://maps.vietmap.vn/maps/styles/tm/style.json?apikey=${encodeURIComponent(key)}`;
}
