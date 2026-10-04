import { Navigation } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LocationViewer } from '@/features/map/components/LocationViewer';
import { directionsUrl, mapSearchUrl, rememberedGpsOrigin } from '@/features/map/lib/location';
import { useI18n } from '@/locales';

export function LocationMessage({
  location,
}: {
  location: { lat: number; lng: number; address: string; label: string };
}) {
  const { t } = useI18n();
  const title = location.label || location.address || t('chat.locationFallback');
  const origin = rememberedGpsOrigin();

  return (
    <div className="w-full max-w-sm rounded-[22px] border border-navy-800/10 bg-white p-3 text-ink-800 shadow-card">
      <p className="font-semibold text-navy-800">📍 {title}</p>
      {location.address && location.address !== title ? <p className="mt-1 text-sm text-ink-500">{location.address}</p> : null}
      <div className="mt-3">
        <LocationViewer lat={location.lat} lng={location.lng} compact />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={mapSearchUrl(location.lat, location.lng)} target="_blank" rel="noreferrer">
            {t('chat.viewMap')}
          </a>
        </Button>
        <Button asChild size="sm" variant="copper">
          <a href={directionsUrl(location.lat, location.lng, origin)} target="_blank" rel="noreferrer">
            <Navigation className="h-4 w-4" /> {t('chat.directions')}
          </a>
        </Button>
      </div>
    </div>
  );
}
