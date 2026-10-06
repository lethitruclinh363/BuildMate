import { VietMapView } from '@/features/map/components/VietMapView';

/** Service-area circle. The street address pin stays on the profile map beside this one. */
export function ServiceAreaMap({ lat, lng, radiusKm }: { lat: number; lng: number; radiusKm: number }) {
  return (
    <VietMapView
      center={{ lat, lng }}
      zoom={12}
      radiusKm={Math.max(radiusKm, 1)}
      radiusColor="copper"
      interactive={false}
      showStyleSwitcher
      className="h-52 w-full overflow-hidden rounded-2xl md:h-64"
    />
  );
}
