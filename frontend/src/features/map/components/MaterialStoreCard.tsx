import { Link } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { BadgeCheck, MapPin, Star, Store } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MediaFrame } from '@/components/media/ProfileMedia';
import { categoryDisplayLabel } from '@/data/material-categories';
import { formatDistance } from '@/features/map/lib/distance';
import { exploreTrustText } from '@/features/map/lib/trustLine';
import { useI18n } from '@/locales';
import type { NearbyPlace } from '@/types/marketplace';

function categoryLine(place: NearbyPlace, t: (path: string, vars?: Record<string, string | number>) => string) {
  const registered = place.materialCategories || [];
  const fromProducts = [...new Set((place.products || []).map((item) => item.category).filter(Boolean))].map((name) => ({
    name,
    type: 'SYSTEM' as const,
  }));
  const source = registered.length ? registered : fromProducts;
  const labels = [...new Set(source.map((item) => categoryDisplayLabel(item, t)))];
  if (!labels.length) return '';
  const head = labels.slice(0, 3).join(' · ');
  return labels.length > 3 ? `${head} ${t('explore.moreCount', { n: labels.length - 3 })}` : head;
}

/** Card cửa hàng vật liệu. Ảnh đại diện là logo, không lấy ảnh bìa hay thư viện. */
export function StoreResultCard({
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
  const name = place.businessName || place.storeName;
  const photo = place.logo || place.avatar || '';
  const materials = categoryLine(place, t);
  const storeHref = `/stores/${place.id}`;
  const productsHref = `/stores/${place.id}#materials`;

  return (
    <div id={`place-store-${place.id}`} className="scroll-mt-24">
    <Card hover={false} className={`flex h-full flex-col p-4 ${active ? 'ring-2 ring-copper-400' : ''}`} onClick={onHover}>
      <div className="flex gap-4">
        <Link to={storeHref} state={back} className="h-14 w-14 shrink-0 sm:h-[72px] sm:w-[72px]" aria-label={name}>
          <MediaFrame
            src={photo}
            alt={name}
            fit="logo"
            frameClassName="h-14 w-14 rounded-2xl bg-white sm:h-[72px] sm:w-[72px]"
            empty={
              <span className="absolute inset-0 grid place-items-center bg-navy-800 text-paper-50">
                <Store className="h-6 w-6" aria-hidden />
              </span>
            }
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={storeHref} state={back} className="font-display text-xl text-navy-800 hover:text-copper-600 sm:text-[22px]">
              {name}
            </Link>
            {place.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t('common.verified')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">{t('explore.storeKind')}</p>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-sm text-ink-600">
        <p className="flex flex-wrap items-center gap-x-2">
          <MapPin className="h-4 w-4 text-copper-500" />
          <span>{formatDistance(place.distanceMeters ?? place.distance * 1000)}</span>
          {place.city ? <span>· {place.city}</span> : null}
        </p>
        <p className="flex flex-wrap items-center gap-1 font-semibold text-navy-800">
          <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
          {exploreTrustText(place, t)}
        </p>
        {materials ? <p className="line-clamp-2 leading-6">{t('explore.materialLine')}: {materials}</p> : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Button asChild size="sm" variant="copper">
          <Link to={storeHref} state={back}>{t('explore.viewStore')}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={productsHref} state={back}>{t('explore.viewProducts')}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={productsHref} state={back}>{t('explore.buy')}</Link>
        </Button>
      </div>
    </Card>
    </div>
  );
}

export const MaterialStoreCard = StoreResultCard;
