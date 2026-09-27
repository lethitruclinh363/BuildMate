import { Marker as LeafletMarker } from 'react-leaflet';
import L from 'leaflet';
import type { NearbyPlace } from '@/types/marketplace';

export function makePin(color: string, glyph: string) {
  return L.divIcon({
    className: 'bm-pin-wrap',
    html: `<span class="bm-pin" style="background:${color}">${glyph}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export const JOB_SITE_PIN = makePin('#0B2E4A', '●');
export const CONTRACTOR_PIN = makePin('#C9842A', 'C');
export const STORE_PIN = makePin('#D4A017', 'S');

export function PlaceMarker({
  place,
  icon,
  dimmed,
  onSelect,
}: {
  place: NearbyPlace;
  icon: L.DivIcon;
  dimmed?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <LeafletMarker
      position={[place.location.coordinates[1], place.location.coordinates[0]]}
      icon={icon}
      opacity={dimmed ? 0.55 : 1}
      eventHandlers={{ click: () => onSelect(place.id) }}
    />
  );
}
