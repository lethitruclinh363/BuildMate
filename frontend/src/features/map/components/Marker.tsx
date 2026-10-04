import { Marker as LeafletMarker } from 'react-leaflet';
import L from 'leaflet';
import type { NearbyPlace } from '@/types/marketplace';

export function makePin(color: string, glyph: string, selected = false) {
  return L.divIcon({
    className: selected ? 'bm-pin-wrap bm-pin-selected' : 'bm-pin-wrap',
    html: `<span class="bm-pin" style="background:${color}">${glyph}</span>`,
    iconSize: selected ? [44, 44] : [32, 32],
    iconAnchor: selected ? [22, 44] : [16, 32],
  });
}

const PERSON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const SHOP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 9 5 4h14l2 5"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/></svg>';

export const JOB_SITE_PIN = makePin('#0B2E4A', '●');
export const SELECTED_PIN = L.divIcon({
  className: 'bm-pin-wrap bm-pin-still',
  html: '<span class="bm-pin" style="background:#0B2E4A">●</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});
export const CONTRACTOR_PIN = makePin('#C9842A', PERSON);
export const STORE_PIN = makePin('#D4A017', SHOP);

export function PlaceMarker({
  place,
  icon,
  selected,
  dimmed,
  onSelect,
}: {
  place: NearbyPlace;
  icon: L.DivIcon;
  selected?: boolean;
  dimmed?: boolean;
  onSelect: () => void;
}) {
  const lng = Number(place.location?.coordinates?.[0]);
  const lat = Number(place.location?.coordinates?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return (
    <LeafletMarker
      position={[lat, lng]}
      icon={icon}
      zIndexOffset={selected ? 800 : 0}
      opacity={dimmed ? 0.45 : 1}
      eventHandlers={{
        click(event) {
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
          onSelect();
        },
      }}
    />
  );
}
