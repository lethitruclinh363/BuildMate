import { Link, useNavigate } from 'react-router-dom';
import { Navigation, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDistance } from '@/features/map/lib/distance';
import { openGoogleMapsDirections } from '@/features/map/lib/location';
import { catalogCategoryLabel } from '@/data/contractor-services';
import { chatApi } from '@/features/chat/services/sprint4.api';
import { vnd } from '@/lib/partner-api';
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

export function ExplorePopup({
  place,
  kind,
  onClose,
}: {
  place: NearbyPlace;
  kind: 'contractor' | 'store';
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const point = placePoint(place);
  const name = place.businessName || place.storeName;
  const distance = formatDistance(place.distanceMeters ?? place.distance * 1000);
  const categories = [...new Set(place.services.map((service) => catalogCategoryLabel(service.category, t)))].slice(0, 3);
  const profilePath = kind === 'contractor' ? `/contractors/${place.contractorId}` : `/stores/${place.id}`;

  async function openChat() {
    const fallback = kind === 'contractor' ? repairCreatePath(place.contractorId) : `/stores/${place.id}`;
    if (role !== 'CUSTOMER') {
      navigate(withAuthRedirect(fallback, role));
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
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-[600] max-h-[46%] overflow-y-auto rounded-[22px] border border-navy-800/10 bg-white p-4 shadow-lift sm:inset-x-auto sm:right-3 sm:w-[340px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-copper-500">
            {kind === 'contractor' ? t('explore.contractor') : t('explore.store')}
          </p>
          <h3 className="mt-1 font-display text-2xl leading-tight text-navy-800">{name}</h3>
        </div>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-ink-400 hover:bg-paper-100" onClick={onClose} aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
        <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
        {place.reviewCount > 0 ? `${place.rating.toFixed(1)} (${place.reviewCount})` : t('explore.noRating')}
        {distance ? <span className="font-normal text-ink-500">· {distance}</span> : null}
      </p>
      {kind === 'contractor' && categories.length ? (
        <p className="mt-2 text-sm text-ink-600">{categories.join(' · ')}</p>
      ) : null}
      {kind === 'store' ? (
        <p className="mt-2 text-sm text-ink-600">
          {t('explore.deliveryRadius', { km: place.serviceRadiusKm || 0 })}
          {place.deliveryEnabled ? ` · ${t('explore.deliveryFee', { fee: vnd(place.baseDeliveryFee || 0) })}` : ''}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={profilePath}>{kind === 'contractor' ? t('explore.viewProfile') : t('explore.viewStore')}</Link>
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void openChat()}>
          {t('explore.chat')}
        </Button>
        {point ? (
          <Button type="button" size="sm" variant="copper" onClick={() => openGoogleMapsDirections(point.lat, point.lng)}>
            <Navigation className="h-4 w-4" /> {t('explore.directions')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
