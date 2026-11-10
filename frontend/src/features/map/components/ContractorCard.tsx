
import { Link } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { BadgeCheck, MapPin, Navigation, Star } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MediaFrame } from '@/components/media/ProfileMedia';

import { catalogCategoryLabel } from '@/data/contractor-services';
import { formatDistance } from '@/features/map/lib/distance';
import {
  fromGeoPoint,
  openGoogleMapsDirections,
  type LatLng,
} from '@/features/map/lib/location';
import { exploreTrustText } from '@/features/map/lib/trustLine';

import { usePartnerPaths } from '@/lib/partner-paths';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

import type { NearbyPlace } from '@/types/marketplace';

function meaningfulIntro(value?: string) {
  const text = (value || '').replace(/\s+/g, ' ').trim();

  if (
    text.length < 16 ||
    text.split(' ').filter(Boolean).length < 3
  ) {
    return '';
  }

  return text;
}

/** Card đội thợ trên Explore: hồ sơ công khai, không phải hồ sơ xác minh. */
export function ContractorResultCard({
  place,
  active,
  onHover,
  origin,
}: {
  place: NearbyPlace;
  active?: boolean;
  onHover?: () => void;
  origin?: LatLng | null;
}) {
  const { t } = useI18n();
  const back = useReturnState();
  const paths = usePartnerPaths();
  const pushToast = useToastStore((state) => state.push);

  const point = fromGeoPoint(place.location);
  const photo = place.avatar || place.logo || '';
  const intro = meaningfulIntro(place.description);

  const trades = [
    ...new Set(
      place.services.map((service) =>
        catalogCategoryLabel(service.category, t)
      )
    ),
  ].slice(0, 2);

  const profilePath = paths.contractor(place.contractorId);
  const name = place.businessName || place.storeName;

  return (
    <div id={`place-contractor-${place.id}`} className="scroll-mt-16">
      <Card
        hover={false}
        className={`flex flex-col p-2.5 md:p-2.5 ${
          active ? 'ring-2 ring-copper-400' : ''
        }`}
        onClick={onHover}
      >
        <div className="flex items-start gap-2.5">
          <Link
            to={profilePath}
            state={back}
            className="h-10 w-10 shrink-0"
            aria-label={name}
          >
            <MediaFrame
              src={photo}
              alt={name}
              fit="cover"
              frameClassName="h-10 w-10 rounded-lg"
              empty={
                <span className="absolute inset-0 grid place-items-center bg-navy-800 font-display text-sm text-paper-50">
                  {(name || 'B').slice(0, 1)}
                </span>
              }
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link
                to={profilePath}
                state={back}
                className="min-w-0 truncate font-display text-sm text-navy-800 hover:text-copper-600 sm:text-base"
              >
                {name}
              </Link>

              {place.verified ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  <BadgeCheck className="h-3 w-3" />
                  {t('common.verified')}
                </span>
              ) : null}
            </div>

            <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-ink-500">
              {trades.length
                ? trades.join(' · ')
                : intro || t('explore.noIntro')}
            </p>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-ink-600">
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3 text-copper-500" />
                {formatDistance(
                  place.distanceMeters ?? place.distance * 1000
                )}
                {place.city ? <span>· {place.city}</span> : null}
              </span>

              <span className="inline-flex items-center gap-0.5 font-semibold text-navy-800">
                <Star className="h-3 w-3 fill-copper-400 text-copper-400" />
                {exploreTrustText(place, t)}
              </span>

              <span>
                {t('explore.completedJobs', {
                  n: place.completedProjects || 0,
                })}
              </span>
            </p>
          </div>
        </div>
{/* Hồ sơ nhà thầu và nhà cung cấp vật liệu trên Explore: hồ sơ công khai, không phải hồ sơ xác minh. */}
        <div className="mt-2 flex items-stretch gap-1.5">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-10 min-h-10 min-w-0 flex-1 px-3"
          >
            <Link to={profilePath} state={back}>
              {t('explore.viewProfile')}
            </Link>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="copper"
            className="h-10 min-h-10 min-w-0 flex-1 px-3"
            onClick={(event) => {
              event.stopPropagation();

              if (!point) {
                pushToast({
                  kind: 'error',
                  title: t('explore.directionsUnavailable'),
                });
                return;
              }

              openGoogleMapsDirections(
                point.lat,
                point.lng,
                origin
              );
            }}
          >
            <Navigation className="h-4 w-4" />
            {t('explore.directions')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export const ContractorCard = ContractorResultCard;
