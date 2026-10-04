import { Navigation } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { mapSearchUrl, openGoogleMapsDirections, rememberedGpsOrigin } from '@/features/map/lib/location';
import { useI18n } from '@/locales';

export function MapPlaceActions({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useI18n();
  const origin = rememberedGpsOrigin();

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={mapSearchUrl(lat, lng)} target="_blank" rel="noreferrer">
          {t('map.openMap')}
        </a>
      </Button>
      <Button type="button" size="sm" variant="copper" onClick={() => openGoogleMapsDirections(lat, lng, origin)}>
        <Navigation className="h-4 w-4" /> {t('public.directions')}
      </Button>
    </div>
  );
}
