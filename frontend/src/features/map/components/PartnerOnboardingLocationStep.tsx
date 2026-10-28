import { Check, Compass, MapPin, Navigation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormLabel } from '@/components/ui/FormLabel';
import { AddressSearch } from '@/features/map/components/AddressSearch';
import { VietMapView } from '@/features/map/components/VietMapView';
import {
  autocompleteFocus,
  formatCoordinates,
  hasCoordinates,
  rememberGpsOrigin,
  requestCurrentPosition,
  type GeoErrorKind,
} from '@/features/map/lib/location';
import {
  originFromPlace,
  placeDetail,
  reverseGeocode,
  type AddressSuggestion,
} from '@/features/map/services/geocoding';
import type { LocationSource } from '@/features/map/types';
import { useI18n } from '@/locales';
import { cn } from '@/lib/cn';

// Vietnam geographical center for default camera when no location is set
const VIETNAM_DEFAULT_CENTER = { lat: 16.047079, lng: 108.20623 };

export interface PartnerOnboardingLocationPatch {
  address?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  locationConfirmed?: boolean;
  locationSource?: LocationSource;
  providerRefId?: string | null;
}

export interface PartnerOnboardingLocationStepProps {
  storeOwner: boolean;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  locationConfirmed: boolean;
  locationSource?: LocationSource;
  providerRefId?: string | null;
  touched: Record<string, boolean>;
  onChange: (patch: PartnerOnboardingLocationPatch) => void;
  onConfirm: () => void;
  disabled?: boolean;
}

function inputStyle(ok: boolean, touched: boolean) {
  return cn(
    'mt-1.5 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20',
    !touched ? 'border-navy-800/12' : ok ? 'border-emerald-500' : 'border-red-400'
  );
}

export function PartnerOnboardingLocationStep({
  storeOwner,
  address,
  city,
  lat,
  lng,
  locationConfirmed,
  locationSource,
  touched,
  onChange,
  onConfirm,
  disabled = false,
}: PartnerOnboardingLocationStepProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState(address || '');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [notice, setNotice] = useState('');
  const [gpsError, setGpsError] = useState<GeoErrorKind | ''>('');
  const reverseTimer = useRef<number>(0);

  const hasCoords = hasCoordinates(lat, lng);
  const addressOk = address.trim().length >= 4;
  const cityOk = city.trim().length >= 2;

  // Sync search input query when address changes externally (e.g. restore from draft)
  useEffect(() => {
    if (address && !query) {
      setQuery(address);
    }
  }, [address]);

  useEffect(() => () => window.clearTimeout(reverseTimer.current), []);

  const gpsMessage =
    gpsError === 'denied'
      ? t('map.gpsDenied')
      : gpsError === 'unavailable'
        ? t('map.gpsUnavailable')
        : '';

  function sourceLabel(src?: LocationSource) {
    if (src === 'GPS') return t('auth.onboardSourceGps');
    if (src === 'VIETMAP_PLACE' || src === 'VIETMAP_AUTOCOMPLETE') return t('auth.onboardSourcePlace');
    if (src === 'MANUAL_PIN' || src === 'MAP_PIN') return t('auth.onboardSourceManual');
    return '—';
  }

  // Handle address autocomplete selection
  async function handleSelectSuggestion(hit: AddressSuggestion) {
    setSearching(true);
    setNotice('');
    setGpsError('');
    try {
      const place = await placeDetail(hit.refId);
      const origin = originFromPlace(place, 'VIETMAP_PLACE');
      if (!hasCoordinates(origin.lat, origin.lng)) {
        setNotice(t('map.searchFailed'));
        return;
      }
      const resolvedAddress = origin.address || hit.display || hit.name || '';
      const resolvedCity = origin.city || city;
      setQuery(resolvedAddress);
      onChange({
        address: resolvedAddress,
        city: resolvedCity,
        lat: origin.lat,
        lng: origin.lng,
        locationSource: 'VIETMAP_PLACE',
        providerRefId: hit.refId,
        locationConfirmed: false,
      });
    } catch {
      setNotice(t('map.searchFailed'));
    } finally {
      setSearching(false);
    }
  }

  // Handle pin movement (from drag or map click)
  function handlePinMove(newLat: number, newLng: number, source: LocationSource = 'MANUAL_PIN') {
    if (!hasCoordinates(newLat, newLng)) {
      setNotice(t('map.searchFailed'));
      return;
    }
    window.clearTimeout(reverseTimer.current);
    // Immediately update coordinates and invalidate confirmation
    onChange({
      lat: newLat,
      lng: newLng,
      locationSource: source,
      locationConfirmed: false,
    });

    // Debounce reverse geocode to fetch human-readable address
    reverseTimer.current = window.setTimeout(() => {
      setReversing(true);
      setNotice('');
      reverseGeocode(newLat, newLng)
        .then((hit) => {
          const resolvedAddress = hit.address || hit.display || hit.label || address;
          const resolvedCity = hit.city || city;
          if (resolvedAddress) setQuery(resolvedAddress);
          onChange({
            address: resolvedAddress,
            city: resolvedCity,
            lat: newLat,
            lng: newLng,
            locationSource: source,
            providerRefId: hit.refId,
            locationConfirmed: false,
          });
        })
        .catch(() => {
          setNotice(t('map.reverseFailed'));
        })
        .finally(() => setReversing(false));
    }, 400);
  }

  // Use browser geolocation
  async function handleUseGps() {
    setLocating(true);
    setGpsError('');
    setNotice('');
    try {
      const point = await requestCurrentPosition();
      if (!hasCoordinates(point.lat, point.lng)) {
        setGpsError('unavailable');
        return;
      }
      rememberGpsOrigin(point);
      handlePinMove(point.lat, point.lng, 'GPS');
    } catch (err) {
      const kind = (err as { kind?: GeoErrorKind }).kind;
      setGpsError(kind === 'denied' ? 'denied' : 'unavailable');
    } finally {
      setLocating(false);
    }
  }

  function handleConfirmClick() {
    if (!hasCoords || !addressOk || !cityOk) return;
    onConfirm();
  }

  const mapCenter = hasCoords
    ? { lat: Number(lat), lng: Number(lng) }
    : VIETNAM_DEFAULT_CENTER;

  const mapZoom = hasCoords ? 17 : 6;
  const isBusy = searching || locating || reversing || disabled;

  return (
    <div className="mt-5 space-y-5">
      <div>
        <h2 className="font-display text-xl text-navy-800">
          {storeOwner ? t('auth.onboardLocationTitleStore') : t('auth.onboardLocationTitleContractor')}
        </h2>
        <p className="mt-1 text-sm text-ink-500">{t('auth.onboardLocationDesc')}</p>
      </div>

      {/* Address Search & GPS Action Row */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <AddressSearch
            inputId="onboard-address-search"
            value={query}
            onChange={setQuery}
            onSelect={(hit) => void handleSelectSuggestion(hit)}
            focus={autocompleteFocus(hasCoords ? { lat: Number(lat), lng: Number(lng) } : null, null)}
            placeholder={t('map.addressPlaceholder')}
          />
        </div>
        <Button
          id="onboard-use-gps"
          type="button"
          variant="outline"
          loading={locating}
          disabled={disabled || locating}
          onClick={() => void handleUseGps()}
          className="shrink-0"
        >
          <Navigation className="h-4 w-4" />
          <span>{t('map.useCurrent')}</span>
        </Button>
      </div>

      {gpsMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {gpsMessage}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {notice}
        </div>
      ) : null}

      {/* Interactive VietMap View */}
      <div className="relative overflow-hidden rounded-[22px] border border-navy-800/10 bg-white shadow-card">
        <VietMapView
          center={mapCenter}
          zoom={mapZoom}
          marker={hasCoords ? { lat: Number(lat), lng: Number(lng), draggable: true } : null}
          className="h-[320px] w-full md:h-[380px]"
          showStyleSwitcher
          onMapClick={(clickLat, clickLng) => handlePinMove(clickLat, clickLng, 'MANUAL_PIN')}
          onMarkerDrag={(dragLat, dragLng) => handlePinMove(dragLat, dragLng, 'MANUAL_PIN')}
        />

        {isBusy ? (
          <div className="pointer-events-none absolute left-14 top-3 z-10 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-navy-800 shadow-card">
            {locating ? t('map.locating') : reversing ? t('map.reversing') : t('map.searching')}
          </div>
        ) : null}

        {!hasCoords ? (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 mx-auto max-w-md rounded-xl bg-navy-900/80 px-4 py-2.5 text-center text-xs font-medium text-white backdrop-blur">
            <Compass className="mr-1.5 inline h-4 w-4 text-copper-300" />
            {t('auth.onboardCoordsRequired')}
          </div>
        ) : null}
      </div>

      {/* Location Details & Confirmation Section */}
      <div className="rounded-2xl border border-navy-800/10 bg-paper-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/8 pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-copper-500" />
            <h3 className="text-sm font-semibold text-navy-800">{t('auth.onboardLocationDetails')}</h3>
          </div>
          <div>
            {locationConfirmed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                {t('auth.onboardLocationConfirmed')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {t('auth.onboardLocationUnconfirmed')}
              </span>
            )}
          </div>
        </div>

        {/* Address and City editable inputs */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-1">
            <FormLabel required>{t('auth.onboardAddress')}</FormLabel>
            <input
              id="onboard-address"
              className={inputStyle(addressOk, Boolean(touched.address))}
              maxLength={200}
              value={address}
              onChange={(event) =>
                onChange({
                  address: event.target.value,
                  locationConfirmed: false,
                })
              }
              placeholder={t('map.addressPlaceholder')}
            />
            {touched.address && !addressOk ? (
              <span className="mt-1 block text-xs text-red-600">{t('auth.onboardAddressRequired')}</span>
            ) : null}
          </label>

          <label className="block sm:col-span-1">
            <FormLabel required>{t('auth.onboardCity')}</FormLabel>
            <input
              id="onboard-city"
              className={inputStyle(cityOk, Boolean(touched.city))}
              maxLength={80}
              value={city}
              onChange={(event) =>
                onChange({
                  city: event.target.value,
                  locationConfirmed: false,
                })
              }
              placeholder="Ví dụ: TP. Hồ Chí Minh, Hà Nội, Đà Nẵng..."
            />
            {touched.city && !cityOk ? (
              <span className="mt-1 block text-xs text-red-600">{t('auth.onboardCityRequired')}</span>
            ) : null}
          </label>
        </div>

        {/* Technical coordinates & source grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-navy-800/8 bg-white p-3.5 sm:grid-cols-3">
          <div>
            <span className="block text-xs font-medium text-ink-400">{t('auth.onboardLatitude')}</span>
            <span className="mt-1 block font-mono text-xs font-semibold text-navy-800 sm:text-sm">
              {hasCoords ? Number(lat).toFixed(6) : '—'}
            </span>
          </div>
          <div>
            <span className="block text-xs font-medium text-ink-400">{t('auth.onboardLongitude')}</span>
            <span className="mt-1 block font-mono text-xs font-semibold text-navy-800 sm:text-sm">
              {hasCoords ? Number(lng).toFixed(6) : '—'}
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="block text-xs font-medium text-ink-400">{t('auth.onboardLocationSource')}</span>
            <span className="mt-1 block text-xs font-semibold text-navy-800 sm:text-sm">
              {sourceLabel(locationSource)}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          {t('auth.onboardLocationDragHint')}
        </p>

        {/* Confirm location button */}
        <div className="mt-4 flex flex-col items-end gap-2 sm:flex-row sm:justify-between">
          <div className="text-xs text-ink-400">
            {hasCoords ? formatCoordinates(Number(lat), Number(lng)) : null}
          </div>
          <Button
            id="onboard-confirm-location"
            type="button"
            variant={locationConfirmed ? 'outline' : 'primary'}
            disabled={disabled || isBusy || !hasCoords || !addressOk || !cityOk || locationConfirmed}
            onClick={handleConfirmClick}
            className="w-full sm:w-auto"
          >
            {locationConfirmed ? (
              <>
                <Check className="mr-1.5 h-4 w-4 text-emerald-600" />
                <span>{t('auth.onboardLocationConfirmed')}</span>
              </>
            ) : (
              <span>{t('auth.onboardConfirmLocationBtn')}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
