import { Link } from 'react-router-dom';
import { MapPin, ShoppingBag, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { NearbyPlace } from '@/types/marketplace';

/** Card cửa hàng vật liệu: xem cửa hàng, sản phẩm và mua hàng. Không nhận yêu cầu sửa chữa. */
export function MaterialStoreCard({
  place,
  active,
  onHover,
}: {
  place: NearbyPlace;
  active?: boolean;
  onHover?: () => void;
}) {
  const { t } = useI18n();
  const storeHref = `/stores/${place.id}`;
  const productsHref = `/stores/${place.id}#materials`;

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
        {(place.products || []).slice(0, 3).map((item) => (
          <Badge key={item.id} tone="mist">
            {item.name}
          </Badge>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={storeHref}>{t('explore.viewStore')}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={productsHref}>{t('explore.viewProducts')}</Link>
        </Button>
        <Button asChild size="sm" variant="copper">
          <Link to={productsHref}>
            <ShoppingBag className="h-4 w-4" /> {t('explore.buy')}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
