import { Link } from 'react-router-dom';
import { MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestRepairButton } from '@/features/repair-request/components/RequestRepairButton';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { NearbyPlace } from '@/types/marketplace';

/** Card đội thợ: dịch vụ sửa chữa và yêu cầu báo giá. */
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

  return (
    <Card className={active ? 'ring-2 ring-copper-400' : undefined} onClick={onHover}>
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-navy-800/10">
          {place.coverImage ? (
            <img src={mediaUrl(place.coverImage)} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg text-navy-800">{place.businessName}</h3>
            {place.verified ? <Badge tone="success">{t('common.verified')}</Badge> : null}
          </div>
          <p className="text-xs text-ink-400">{place.storeName}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-copper-600">
            <MapPin className="h-3.5 w-3.5" /> {place.distance} {t('common.km')}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
            <Star className="h-3.5 w-3.5 fill-copper-400 text-copper-400" /> {place.rating.toFixed(1)}
            <span className="font-normal text-ink-400">({place.reviewCount})</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {place.services.slice(0, 3).map((s) => (
          <Badge key={s.id} tone="mist">
            {s.name}
          </Badge>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={`/contractors/${place.contractorId}`}>{t('common.viewDetail')}</Link>
        </Button>
        <RequestRepairButton contractorId={place.contractorId} />
      </div>
    </Card>
  );
}
