import { Link } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { BadgeCheck, MapPin, Navigation, Star, Store } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MediaFrame } from '@/components/media/ProfileMedia';
import { categoryDisplayLabel } from '@/data/material-categories';
import { formatDistance } from '@/features/map/lib/distance';
import { fromGeoPoint, openGoogleMapsDirections, type LatLng } from '@/features/map/lib/location';
import { exploreTrustText } from '@/features/map/lib/trustLine';
import { usePartnerPaths } from '@/lib/partner-paths';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import type { NearbyPlace } from '@/types/marketplace';

export type MaterialStoreMatchSummary = {
  matchedCount: number;
  totalCount: number;
  matchedNames: string[];
  missingNames: string[];
};

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
  origin,
  requirementMatch,
}: {
  place: NearbyPlace;
  active?: boolean;
  onHover?: () => void;
  origin?: LatLng | null;
  requirementMatch?: MaterialStoreMatchSummary;
}) {
  const { t } = useI18n();
  const back = useReturnState();
  const paths = usePartnerPaths();
  const pushToast = useToastStore((state) => state.push);
  const name = place.businessName || place.storeName;
  const photo = place.logo || place.avatar || '';
  const materials = categoryLine(place, t);
  const storeHref = paths.store(place.id);
  const point = fromGeoPoint(place.location);
  const serviceRadiusKm = Number(place.serviceRadiusKm);
  const deliveryRangeText =
    Number.isFinite(serviceRadiusKm) && serviceRadiusKm > 0
      ? t('explore.deliveryRadius', { km: serviceRadiusKm })
      : t('explore.deliveryRangeUnknown');

  return (
    <div id={`place-store-${place.id}`} className="scroll-mt-16">
      <Card hover={false} className={`flex flex-col p-2.5 md:p-2.5 ${active ? 'ring-2 ring-copper-400' : ''}`} onClick={onHover}>
        <div className="flex items-start gap-2.5">
          <Link to={storeHref} state={back} className="h-10 w-10 shrink-0" aria-label={name}>
            <MediaFrame
              src={photo}
              alt={name}
              fit="logo"
              frameClassName="h-10 w-10 rounded-lg bg-white"
              empty={
                <span className="absolute inset-0 grid place-items-center bg-navy-800 text-paper-50">
                  <Store className="h-4 w-4" aria-hidden />
                </span>
              }
            />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link to={storeHref} state={back} className="min-w-0 truncate font-display text-sm text-navy-800 hover:text-copper-600 sm:text-base">
                {name}
              </Link>
              {place.verified ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  <BadgeCheck className="h-3 w-3" />
                  {t('common.verified')}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-ink-500">{t('explore.storeKind')}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-ink-600">
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3 text-copper-500" />
                {t('explore.searchDistance', {
                  distance: formatDistance(place.distanceMeters ?? place.distance * 1000),
                })}
                {place.city ? <span>· {place.city}</span> : null}
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-navy-800">
                <Star className="h-3 w-3 fill-copper-400 text-copper-400" />
                {exploreTrustText(place, t)}
              </span>
            </p>
            {materials ? <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-ink-600">{t('explore.materialLine')}: {materials}</p> : null}
            {requirementMatch ? (
              <div className="mt-1 space-y-0.5 text-[11px] leading-4">
                <p className="font-semibold text-navy-800">
                  {t('explore.mrlMatchCount', {
                    matched: requirementMatch.matchedCount,
                    total: requirementMatch.totalCount,
                  })}
                </p>
                {requirementMatch.matchedNames.length ? (
                  <p className="line-clamp-1 text-ink-600">
                    {t('explore.mrlMatchedItems', { items: requirementMatch.matchedNames.join(', ') })}
                  </p>
                ) : null}
                {requirementMatch.missingNames.length ? (
                  <p className="line-clamp-1 text-ink-500">
                    {t('explore.mrlMissingItems', { items: requirementMatch.missingNames.join(', ') })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-1 text-[11px] leading-4 text-ink-500">{deliveryRangeText}</p>
          </div>
        </div>
        <div className="mt-2 flex items-stretch gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-10 min-h-10 min-w-0 flex-1 px-3">
            <Link to={storeHref} state={back}>{t('explore.viewStore')}</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="copper"
            className="h-10 min-h-10 min-w-0 flex-1 px-3"
            onClick={(event) => {
              event.stopPropagation();
              if (!point) {
                pushToast({ kind: 'error', title: t('explore.directionsUnavailable') });
                return;
              }
              openGoogleMapsDirections(point.lat, point.lng, origin);
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

export const MaterialStoreCard = StoreResultCard;
