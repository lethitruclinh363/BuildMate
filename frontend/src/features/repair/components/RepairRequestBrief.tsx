import { SiteLocationCard } from '@/features/map/components/SiteLocationCard';
import { placeFromRecord, type PlacePin } from '@/features/map/lib/location';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { mediaUrl } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import type { RepairRequest } from '@/types/sprint4';

function requestPlace(item: RepairRequest): PlacePin | null {
  const fromPlace = item.place && Number.isFinite(item.place.lat) && Number.isFinite(item.place.lng)
    ? {
        lat: item.place.lat,
        lng: item.place.lng,
        address: item.place.address || item.address || '',
        label: item.place.label || item.address || '',
      }
    : null;
  return fromPlace || placeFromRecord({ location: item.location, address: item.address });
}

function formatWhen(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN');
}

export function RepairRequestBrief({
  item,
  collapsible = false,
  defaultOpen = true,
}: {
  item: RepairRequest;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const place = requestPlace(item);
  const images = item.images || [];
  const videos = item.videos || [];
  const body = (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('request.pickGroup')}</dt>
          <dd className="mt-1 font-medium text-navy-800">{catalogCategoryLabel(String(item.category || ''), t)}</dd>
        </div>
        {item.serviceName ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('request.pickService')}</dt>
            <dd className="mt-1 font-medium text-navy-800">{catalogServiceLabel(item.serviceName, t)}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('request.fieldTitle')}</dt>
          <dd className="mt-1 font-medium text-navy-800">{item.title}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('request.fieldDesc')}</dt>
          <dd className="mt-1 whitespace-pre-wrap leading-6 text-ink-700">{item.description}</dd>
        </div>
        {item.customer ? (
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('contractorRequests.customer')}</dt>
            <dd className="mt-1 font-medium text-navy-800">
              {item.customer.name}
              {item.customer.phone ? <span className="block text-sm font-normal text-ink-500">{item.customer.phone}</span> : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('contractorRequests.sentAt')}</dt>
          <dd className="mt-1 text-ink-700">{formatWhen(item.createdAt) || labeled(t, 'status', item.status)}</dd>
        </div>
      </dl>
      {images.length || videos.length ? (
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ink-400">{t('request.media')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((src) => (
              <a key={src} href={mediaUrl(src)} target="_blank" rel="noreferrer">
                <img src={mediaUrl(src)} alt="" className="h-24 w-24 rounded-xl object-cover" />
              </a>
            ))}
            {videos.map((src) => (
              <video key={src} src={mediaUrl(src)} controls className="h-24 w-36 rounded-xl object-cover" />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-400">{t('contractorRequests.mediaEmpty')}</p>
      )}
      {place ? (
        <SiteLocationCard title={t('request.fieldAddress')} place={place} />
      ) : item.address ? (
        <p className="text-sm text-ink-700">{item.address}</p>
      ) : null}
    </div>
  );

  if (!collapsible) return body;

  return (
    <details
      className="rounded-[22px] border border-navy-800/8 bg-white p-5 shadow-card"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none font-display text-lg text-navy-800">
        {t('quote.requestContext')}
      </summary>
      <div className="mt-4">{body}</div>
    </details>
  );
}
