import { Navigation } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LocationViewer } from '@/features/map/components/LocationViewer';
import { directionsUrl, mapSearchUrl, rememberedGpsOrigin, type PlacePin } from '@/features/map/lib/location';
import { useI18n } from '@/locales';

export function SiteLocationCard({ title, place }: { title: string; place: PlacePin }) {
  const { t } = useI18n();
  const origin = rememberedGpsOrigin();
  const heading = place.label || place.address;

  return (
    <Card hover={false}>
      <p className="text-xs uppercase tracking-[0.18em] text-copper-500">{title}</p>
      {heading ? <p className="mt-2 font-semibold text-navy-800">📍 {heading}</p> : null}
      {place.address && place.address !== heading ? <p className="mt-1 text-sm text-ink-500">{place.address}</p> : null}
      <div className="mt-3">
        <LocationViewer lat={place.lat} lng={place.lng} address={place.address} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={mapSearchUrl(place.lat, place.lng)} target="_blank" rel="noreferrer">
            {t('map.openMap')}
          </a>
        </Button>
        <Button asChild size="sm" variant="copper">
          <a href={directionsUrl(place.lat, place.lng, origin)} target="_blank" rel="noreferrer">
            <Navigation className="h-4 w-4" /> {t('public.directions')}
          </a>
        </Button>
      </div>
    </Card>
  );
}
