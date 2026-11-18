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
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 to-[#36576d] p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white/90">
            {catalogCategoryLabel(String(item.category || ''), t)}
          </span>
          {item.serviceName ? (
            <span className="rounded-full bg-copper-400/20 px-3 py-1 text-xs font-semibold tracking-wide text-orange-100">
              {catalogServiceLabel(item.serviceName, t)}
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {t('request.fieldTitle')}
        </p>
        <h3 className="mt-1 font-display text-xl font-semibold leading-snug sm:text-2xl">{item.title}</h3>
        <div className="mt-4 border-t border-white/15 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
            {t('request.fieldDesc')}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/90">{item.description}</p>
        </div>
      </section>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {item.customer ? (
          <div className="rounded-2xl border border-navy-800/8 bg-paper-50 p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {t('contractorRequests.customer')}
            </dt>
            <dd className="mt-1.5 font-semibold text-navy-800">{item.customer.name}</dd>
            {item.customer.phone ? <dd className="mt-0.5 text-ink-500">{item.customer.phone}</dd> : null}
          </div>
        ) : null}
        <div className="rounded-2xl border border-navy-800/8 bg-paper-50 p-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {t('contractorRequests.sentAt')}
          </dt>
          <dd className="mt-1.5 font-medium text-navy-800">
            {formatWhen(item.createdAt) || labeled(t, 'status', item.status)}
          </dd>
        </div>
      </dl>
      {images.length || videos.length ? (
        <div className="rounded-2xl border border-navy-800/8 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">{t('request.media')}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {images.map((src) => (
              <a key={src} href={mediaUrl(src)} target="_blank" rel="noreferrer">
                <img
                  src={mediaUrl(src)}
                  alt=""
                  loading="lazy"
                  className="h-24 w-24 rounded-xl border border-navy-800/10 object-cover shadow-sm transition hover:shadow-card sm:h-28 sm:w-28"
                />
              </a>
            ))}
            {videos.map((src) => (
              <video
                key={src}
                src={mediaUrl(src)}
                controls
                className="h-24 w-36 rounded-xl border border-navy-800/10 bg-navy-900 object-cover shadow-sm sm:h-28 sm:w-44"
              />
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
