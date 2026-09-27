import { MapPin, Navigation } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { useI18n } from '@/locales';

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
}

export function LocationPicker({
  origin,
  onPick,
  onGps,
  gpsStatus,
}: {
  origin: MapOrigin;
  onPick: (origin: MapOrigin) => void;
  onGps: () => void;
  gpsStatus: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(`${query}, Can Tho, Vietnam`)}`;
      const res = await fetch(url);
      const data = (await res.json()) as NominatimHit[];
      setHits(data);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input
            id="site-address"
            placeholder={t('map.addressPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" loading={searching} onClick={() => void search()}>
          {t('common.find')}
        </Button>
        <Button type="button" variant="copper" onClick={onGps}>
          <Navigation className="h-4 w-4" /> {t('map.useGps')}
        </Button>
      </div>
      <p className="inline-flex items-center gap-1 text-xs text-ink-400">
        <MapPin className="h-3.5 w-3.5" />
        {t('map.pin', { lat: origin.lat.toFixed(4), lng: origin.lng.toFixed(4) })}
        {origin.label ? ` · ${origin.label}` : ''}
        {gpsStatus === 'denied' ? ` · ${t('map.gpsBlocked')}` : ''}
        {` · ${t('map.clickMap')}`}
      </p>
      {hits.length ? (
        <ul className="overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
          {hits.map((hit) => (
            <li key={`${hit.lat}-${hit.lon}`}>
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm hover:bg-paper-100"
                onClick={() => {
                  onPick({ lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name });
                  setHits([]);
                }}
              >
                {hit.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
