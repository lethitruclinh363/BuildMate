import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestRepairButton } from '@/features/repair-request/components/RequestRepairButton';
import { catalogCategoryLabel, catalogServiceLabel } from '@/data/contractor-services';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { NearbyPlace } from '@/types/marketplace';

function portraitUrl(place: NearbyPlace) {
  return place.avatar || place.logo || place.coverImage || '';
}

/** Card đội thợ trên Explore: hồ sơ công khai, không phải hồ sơ xác minh. */
export function ContractorCard({
  place,
  active,
  onHover,
}: {
  place: NearbyPlace;
  active?: boolean;
  onHover?: () => void;
}) {
  const { t } = useI18n();
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = photoFailed ? '' : portraitUrl(place);
  const categories = [...new Set(place.services.map((service) => catalogCategoryLabel(service.category, t)))].slice(0, 4);
  const blurb = (place.description || place.slogan || '').trim();
  const profilePath = `/contractors/${place.contractorId}`;

  return (
    <Card className={active ? 'ring-2 ring-copper-400' : undefined} onClick={onHover}>
      <div className="flex gap-4">
        <Link to={profilePath} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl sm:h-24 sm:w-24" aria-label={place.businessName}>
          {photo ? (
            <img src={mediaUrl(photo)} alt="" className="h-full w-full object-cover" onError={() => setPhotoFailed(true)} />
          ) : (
            <span className="grid h-full w-full place-items-center bg-navy-800 font-display text-3xl text-paper-50">
              {(place.businessName || 'B').slice(0, 1)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={profilePath} className="font-display text-xl text-navy-800 hover:text-copper-600">
              {place.businessName}
            </Link>
            {place.verified ? (
              <Badge tone="success">
                <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                {t('common.verified')}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {place.reviewCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-navy-800">
                <Star className="h-3.5 w-3.5 fill-copper-400 text-copper-400" />
                {place.rating.toFixed(1)}
                <span className="font-normal text-ink-400">({t('public.reviewTotal', { n: place.reviewCount })})</span>
              </span>
            ) : (
              t('public.noReviews')
            )}
          </p>
          <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-copper-600">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {place.distance} {t('common.km')}
            </span>
            {place.city ? <span className="text-ink-500">{place.city}</span> : null}
          </p>
          <p className="mt-1 text-sm text-ink-500">{t('explore.completedJobs', { n: place.completedProjects || 0 })}</p>
        </div>
      </div>
      {categories.length ? (
        <p className="mt-3 text-sm font-semibold text-navy-800">{categories.join(' • ')}</p>
      ) : place.services.length ? (
        <p className="mt-3 text-sm font-semibold text-navy-800">
          {place.services.slice(0, 3).map((service) => catalogServiceLabel(service.name, t)).join(' • ')}
        </p>
      ) : null}
      {blurb ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-600">{blurb}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={profilePath}>{t('explore.viewProfile')}</Link>
        </Button>
        <RequestRepairButton contractorId={place.contractorId} />
      </div>
    </Card>
  );
}
