import { formatCoordinates } from '@/features/map/lib/location';
import { VietMapView } from '@/features/map/components/VietMapView';
import { useI18n } from '@/locales';

export function LocationViewer({
  lat,
  lng,
  address,
  compact = false,
}: {
  lat: number;
  lng: number;
  address?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const ready = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className={compact ? 'overflow-hidden rounded-2xl' : 'overflow-hidden rounded-[22px] border border-navy-800/10 bg-white shadow-card'}>
      {ready ? (
        <VietMapView
          center={{ lat, lng }}
          zoom={15}
          marker={{ lat, lng }}
          interactive={false}
          showStyleSwitcher={!compact}
          className={compact ? 'h-28 w-full' : 'h-52 w-full md:h-64'}
        />
      ) : (
        <p className="px-4 py-6 text-sm text-ink-400">{t('map.unavailable')}</p>
      )}
      {compact ? null : (
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-[0.16em] text-copper-500">{t('map.selectedAddress')}</p>
          <p className="mt-1 text-sm font-medium text-navy-800">{address || t('map.emptyAddress')}</p>
          {ready ? (
            <p className="mt-2 text-xs text-ink-400">
              {t('map.coordinates')}: {formatCoordinates(lat, lng)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
