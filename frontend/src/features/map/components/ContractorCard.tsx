import { Link } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MediaFrame } from '@/components/media/ProfileMedia';
import { RequestRepairButton } from '@/features/repair-request/components/RequestRepairButton';
import { catalogCategoryLabel } from '@/data/contractor-services';
import { formatDistance } from '@/features/map/lib/distance';
import { useI18n } from '@/locales';
import type { NearbyPlace } from '@/types/marketplace';

function meaningfulIntro(value?: string) {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  if (text.length < 16 || text.split(' ').filter(Boolean).length < 3) return '';
  return text;
}

/** Card đội thợ trên Explore: hồ sơ công khai, không phải hồ sơ xác minh. */
export function ContractorResultCard({
  place,
  active,
  onHover,
}: {
  place: NearbyPlace;
  active?: boolean;
  onHover?: () => void;
}) {
  const { t } = useI18n();
  const back = useReturnState();
  const photo = place.avatar || place.logo || '';
  const intro = meaningfulIntro(place.description);
  const trades = [...new Set(place.services.map((service) => catalogCategoryLabel(service.category, t)))].slice(0, 2);
  const profilePath = `/contractors/${place.contractorId}`;
  const name = place.businessName || place.storeName;

  return (
    <div id={`place-contractor-${place.id}`} className="scroll-mt-24">
    <Card hover={false} className={`flex h-full flex-col p-4 ${active ? 'ring-2 ring-copper-400' : ''}`} onClick={onHover}>
      <div className="flex gap-4">
        <Link to={profilePath} state={back} className="h-14 w-14 shrink-0 sm:h-[72px] sm:w-[72px]" aria-label={name}>
          <MediaFrame
            src={photo}
            alt={name}
            fit="cover"
            frameClassName="h-14 w-14 rounded-2xl sm:h-[72px] sm:w-[72px]"
            empty={<span className="absolute inset-0 grid place-items-center bg-navy-800 font-display text-2xl text-paper-50">{(name || 'B').slice(0, 1)}</span>}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={profilePath} state={back} className="font-display text-xl text-navy-800 hover:text-copper-600 sm:text-[22px]">
              {name}
            </Link>
            {place.verified ? (
              <Badge tone="success">
                <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                {t('common.verified')}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-500">
            {trades.length ? trades.join(' · ') : intro || t('explore.noIntro')}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm text-ink-600">
        <p className="inline-flex flex-wrap items-center gap-x-2">
          <MapPin className="h-4 w-4 text-copper-500" />
          <span>{formatDistance(place.distanceMeters ?? place.distance * 1000)}</span>
          {place.city ? <span>· {place.city}</span> : null}
        </p>
        <p className="inline-flex items-center gap-1 font-semibold text-navy-800">
          <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
          {place.reviewCount > 0 ? `${place.rating.toFixed(1)} (${place.reviewCount})` : t('explore.noRating')}
        </p>
        <p>{t('explore.completedJobs', { n: place.completedProjects || 0 })}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Button asChild size="sm" variant="outline">
          <Link to={profilePath} state={back}>{t('explore.viewProfile')}</Link>
        </Button>
        <RequestRepairButton contractorId={place.contractorId} />
      </div>
    </Card>
    </div>
  );
}

export const ContractorCard = ContractorResultCard;
