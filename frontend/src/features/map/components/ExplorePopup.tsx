import { Link, useNavigate } from 'react-router-dom';
import { useReturnState } from '@/lib/navigation';
import { MapPin, Navigation, Star, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDistance } from '@/features/map/lib/distance';
import { openGoogleMapsDirections } from '@/features/map/lib/location';
import { catalogCategoryLabel } from '@/data/contractor-services';
import { categoryDisplayLabel } from '@/data/material-categories';
import { chatApi } from '@/features/chat/services/sprint4.api';
import { usePartnerPaths } from '@/lib/partner-paths';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { repairCreatePath, withAuthRedirect } from '@/types/sprint4';
import type { NearbyPlace } from '@/types/marketplace';

function placePoint(place: NearbyPlace) {
  const lng = Number(place.location?.coordinates?.[0]);
  const lat = Number(place.location?.coordinates?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function materialLine(place: NearbyPlace, t: (path: string, vars?: Record<string, string | number>) => string) {
  const registered = place.materialCategories || [];
  const fromProducts = [...new Set((place.products || []).map((item) => item.category).filter(Boolean))].map((name) => ({
    name,
    type: 'SYSTEM' as const,
  }));
  const source = registered.length ? registered : fromProducts;
  const labels = [...new Set(source.map((item) => categoryDisplayLabel(item, t)))];
  if (!labels.length) return '';
  const head = labels.slice(0, 4).join(' · ');
  return labels.length > 4 ? `${head} ${t('explore.moreCount', { n: labels.length - 4 })}` : head;
}

export function ExplorePopup({
  place,
  kind,
  onClose,
  mrlId,
}: {
  place: NearbyPlace;
  kind: 'contractor' | 'store';
  onClose: () => void;
  mrlId?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const back = useReturnState();
  const role = useAuthStore((state) => state.user?.role);
  const paths = usePartnerPaths();
  const point = placePoint(place);
  const name = place.businessName || place.storeName;
  const distance = formatDistance(place.distanceMeters ?? place.distance * 1000);//View Provider Distance and Service Range
  const categories = [...new Set(place.services.map((service) => catalogCategoryLabel(service.category, t)))].slice(0, 4);
  const materials = kind === 'store' ? materialLine(place, t) : '';
  const profilePath = kind === 'contractor' ? paths.contractor(place.contractorId) : paths.store(place.id);
  const ratingLabel =
    place.reviewCount > 0 ? `${place.rating.toFixed(1)} (${place.reviewCount})` : t('explore.noRating');
  const serviceRadiusKm = Number(place.serviceRadiusKm);
  const deliveryRangeText =
    Number.isFinite(serviceRadiusKm) && serviceRadiusKm > 0
      ? t('explore.deliveryRadius', { km: serviceRadiusKm })
      : t('explore.deliveryRangeUnknown');

  async function openChat() {
    const fallback = kind === 'contractor' ? repairCreatePath(place.contractorId) : paths.store(place.id);
    if (role !== 'CUSTOMER') {
      navigate(withAuthRedirect(fallback, role));
      return;
    }
    if (kind === 'store') {
      try {
        const opened = await chatApi.openStoreRoom(place.id);
        const chatPath = `/customer/chat/${opened.data.data.id}${mrlId ? `?mrl=${encodeURIComponent(mrlId)}` : ''}`;
        navigate(chatPath);
      } catch {
        navigate(withAuthRedirect(fallback, role));
      }
      return;
    }
    try {
      const rooms = await chatApi.rooms();
      const existing = (rooms.data.data || []).find(
        (room) => room.contractorId === place.contractorId || room.otherUser?.id === place.contractorId
      );
      if (existing) {
        navigate(`/customer/chat/${existing.id}`);
        return;
      }
    } catch {
      navigate(withAuthRedirect(fallback, role));
      return;
    }
    navigate(fallback);
  }

  return (
    <div className="pointer-events-auto w-[360px] max-w-[min(360px,calc(100vw-2rem))] p-4">
      <div className="max-h-[min(22rem,46vh)] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-copper-500">
            {kind === 'contractor' ? t('explore.contractor') : t('explore.store')}
          </p>
          <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-paper-100" onClick={onClose} aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="mt-1 font-display text-[17px] leading-snug text-navy-800 sm:text-lg">{name}</h3>
        {place.address ? <p className="mt-1 text-sm leading-6 text-ink-500">{place.address}</p> : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-navy-800">
            <Star className="h-4 w-4 shrink-0 fill-copper-400 text-copper-400" />
            <span>{ratingLabel}</span>
          </p>
          {distance ? (
            <p className="inline-flex items-center gap-1 text-sm text-ink-500">
              <MapPin className="h-4 w-4 shrink-0 text-copper-500" />
              <span className="whitespace-nowrap">{t('explore.searchDistance', { distance })}</span>
            </p>
          ) : null}
        </div>

        {kind === 'contractor' && categories.length ? (
          <p className="mt-3 flex items-start gap-1.5 text-sm leading-6 text-ink-600">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-copper-500" />
            <span>{categories.join(' · ')}</span>
          </p>
        ) : null}
        {kind === 'store' ? (
          <div className="mt-3 space-y-1 text-sm leading-6 text-ink-600">
            {materials ? <p>{t('explore.materialLine')}: {materials}</p> : null}
            <p>{deliveryRangeText}</p>
          </div>
        ) : null}
      </div>
{/* View Provider Information */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild size="sm" className="h-auto min-h-10 w-full min-w-0 whitespace-normal px-2 py-2 text-center leading-tight">
          <Link to={profilePath} state={back}>{kind === 'contractor' ? t('explore.viewProfile') : t('explore.viewStore')}</Link>
        </Button>
        <Button type="button" size="sm" variant={mrlId && kind === 'store' ? 'copper' : 'outline'} className="h-auto min-h-10 w-full min-w-0 whitespace-normal px-2 py-2 text-center leading-tight" onClick={() => void openChat()}>
          {mrlId && kind === 'store' ? t('explore.contactStore') : t('explore.chat')}
        </Button>
        {point ? (
          <Button type="button" size="sm" variant="copper" className="col-span-2 h-auto min-h-10 w-full min-w-0 whitespace-normal px-2 py-2 text-center leading-tight" onClick={() => openGoogleMapsDirections(point.lat, point.lng)}>
            <Navigation className="h-4 w-4 shrink-0" /> {t('explore.directions')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
