import { MapPin, Navigation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AddressSearch } from '@/features/map/components/AddressSearch';
import { VietMapView } from '@/features/map/components/VietMapView';
import type { MapOrigin } from '@/features/map/types';
import { autocompleteFocus, formatCoordinates, hasCoordinates, rememberGpsOrigin, requestCurrentPosition, type GeoErrorKind } from '@/features/map/lib/location';
import { originFromPlace, placeDetail, reverseGeocode, type AddressSuggestion } from '@/features/map/services/geocoding';
import { useI18n } from '@/locales';

export function LocationPicker({
  origin,
  onPick,
  onGps,
  gpsStatus,
  mapCenter,
  variant = 'inline',
  onSave,
  onCancel,
  placeholder,
  note,
  compact = false,
  hideGps = false,
  submitToken = 0,
}: {
  origin: MapOrigin;
  onPick: (origin: MapOrigin) => void;
  onGps?: () => void;
  gpsStatus?: string;
  mapCenter?: { lat: number; lng: number } | null;
  variant?: 'inline' | 'panel';
  onSave?: (origin: MapOrigin) => void;
  onCancel?: () => void;
  placeholder?: string;
  note?: string;
  compact?: boolean;
  hideGps?: boolean;
  submitToken?: number;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(origin.label || origin.address || '');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(origin.locationConfirmed === true);
  const [gpsError, setGpsError] = useState<GeoErrorKind | ''>('');
  const reverseTimer = useRef<number>(0);
  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    setQuery(origin.label || origin.address || '');
    setConfirmed(origin.locationConfirmed === true);
  }, [origin.lat, origin.lng, origin.label, origin.address, origin.locationConfirmed]);

  useEffect(() => () => window.clearTimeout(reverseTimer.current), []);

  const gpsMessage =
    gpsError === 'denied' || gpsStatus === 'denied'
      ? t('map.gpsDenied')
      : gpsError === 'unavailable' || gpsStatus === 'unavailable'
        ? t('map.gpsUnavailable')
        : '';
//Set Repair Location by Address( bằng địa chỉ)
  async function choose(hit: AddressSuggestion) {
    setSearching(true);
    setNotice('');
    try {
      const place = await placeDetail(hit.refId);//originFromPlace Chuyển địa chỉ thành tọa độ
      const next = { ...originFromPlace(place, 'VIETMAP_PLACE'), locationConfirmed: false };
      if (!hasCoordinates(next.lat, next.lng)) {
        setNotice(t('map.searchFailed'));
        return;
      }
      setQuery(next.label || hit.display);
      setConfirmed(false);
      onPick(next);
    } catch {
      setNotice(t('map.searchFailed'));
    } finally {
      setSearching(false);
    }
  }

  function resolvePin(lat: number, lng: number, source: MapOrigin['source']) {
    if (!hasCoordinates(lat, lng)) {
      setNotice(t('map.searchFailed'));
      return;
    }
    window.clearTimeout(reverseTimer.current);
    setConfirmed(false);
    onPick({ ...originRef.current, lat, lng, source, locationConfirmed: false });
    reverseTimer.current = window.setTimeout(() => {
      setReversing(true);
      setNotice('');
      reverseGeocode(lat, lng)
        .then((hit) => {
          const next = {
            ...originFromPlace({ ...hit, lat, lng }, source || 'MANUAL_PIN'),
            locationConfirmed: false,
          };
          if (next.label) setQuery(next.label);
          else setNotice(t('map.reverseFailed'));
          onPick(next);
        })
        .catch(() => {
          onPick({ ...originRef.current, lat, lng, source, locationConfirmed: false });
          setNotice(t('map.reverseFailed'));
        })
        .finally(() => setReversing(false));
    }, 400);
  }
//Set Repair Location by Geolocation(bằng GPS)
  async function useCurrent() {
    if (variant === 'inline' && onGps) {
      onGps();
      return;
    }
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
      resolvePin(point.lat, point.lng, 'GPS');
    } catch (err) {
      const kind = (err as { kind?: GeoErrorKind }).kind;
      setGpsError(kind === 'denied' ? 'denied' : 'unavailable');
    } finally {
      setLocating(false);
    }
  }

  function confirmLocation() {
    const next = {
      ...originRef.current,
      locationConfirmed: true,
      locationConfirmedAt: new Date().toISOString(),
    };
    setConfirmed(true);
    onPick(next);
    onSave?.(next);
  }

  const searchRow = (
    <div className={compact ? 'flex min-w-0 items-center gap-2' : 'flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center'}>
     {/* ô nhập search */}
      <AddressSearch
        value={query}
        onChange={setQuery}
        onSelect={(hit) => void choose(hit)}
        focus={autocompleteFocus(origin, mapCenter)}
        placeholder={placeholder}
        submitToken={submitToken}
      />
      {hideGps ? null : (
        <Button
          type="button"
          size={compact ? 'sm' : 'md'}
          variant={variant === 'inline' ? 'copper' : 'outline'}
          loading={locating || gpsStatus === 'asking'}
          className={compact ? 'h-10 shrink-0 whitespace-nowrap px-3' : undefined}
          onClick={() => void useCurrent()}
        >
          <Navigation className="h-4 w-4" /> {t('map.useCurrent')}
        </Button>
      )}
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className={compact ? 'min-w-0' : 'space-y-3'}>
        {searchRow}
        {compact ? null : (
          <>
            <p className="inline-flex items-center gap-1 text-xs text-ink-400">
              <MapPin className="h-3.5 w-3.5" />
              {origin.label || origin.address || t('map.pin', { lat: origin.lat.toFixed(5), lng: origin.lng.toFixed(5) })}
              {` · ${t('map.coordinates')}: ${formatCoordinates(origin.lat, origin.lng)}`}
              {gpsMessage ? ` · ${gpsMessage}` : ''}
            </p>
            <p className="text-xs text-ink-400">{t('map.clickMap')}</p>
          </>
        )}
        {notice ? <p className="text-sm text-red-700">{notice}</p> : null}
        {searching || reversing ? <p className="text-sm text-ink-500">{searching ? t('map.searching') : t('map.reversing')}</p> : null}
      </div>
    );
  }

  const busy = locating || reversing || searching;

  return (
  <div className="rounded-[22px] border border-navy-800/10 bg-white shadow-card">
    {/* Bản đồ chọn vị trí */}
    <div className="relative overflow-hidden rounded-t-[22px]">
      <VietMapView
        center={origin}
        zoom={18}
        marker={{
          lat: origin.lat,
          lng: origin.lng,
          draggable: true,
        }}
        className="h-[280px] w-full md:h-[340px]"
        onMapClick={(lat, lng) =>
          resolvePin(lat, lng, 'MANUAL_PIN')
        }
        onMarkerDrag={(lat, lng) =>
          resolvePin(lat, lng, 'MANUAL_PIN')
        }
      />

      {/* Trạng thái xử lý vị trí */}
      {busy ? (
        <div className="pointer-events-none absolute left-14 top-3 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy-800 shadow-card">
          {locating
            ? t('map.locating')
            : reversing
              ? t('map.reversing')
              : t('map.searching')}
        </div>
      ) : null}
    </div>

    <div className="space-y-3 p-4">
      {/* Tìm kiếm địa chỉ */}
      {searchRow}

      {/* Thông tin và xác nhận vị trí */}
      <div className="rounded-2xl bg-paper-100 px-4 py-3">
        {/* Tiêu đề và trạng thái xác nhận */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.16em] text-copper-500">
            {t('map.confirmTitle')}
          </p>

          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              confirmed ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                confirmed ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />

            {confirmed
              ? t('map.confirmed')
              : t('map.unconfirmed')}
          </span>
        </div>

        {/* Hướng dẫn xác nhận */}
        <p className="mt-2 text-sm leading-6 text-ink-600">
          {t('map.confirmHint')}
        </p>

        {/* Địa chỉ đã chọn */}
        <p className="mt-2 text-sm font-medium text-navy-800">
          {origin.label ||
            origin.address ||
            t('map.emptyAddress')}
        </p>

        {/* Tọa độ vị trí */}
        <p className="mt-2 text-xs text-ink-400">
          {t('map.coordinates')}:{' '}
          {formatCoordinates(origin.lat, origin.lng)}
        </p>

        {/* Hướng dẫn điều chỉnh vị trí */}
        <p className="mt-1 text-xs text-ink-500">
          {t('map.dragExact')}
        </p>

        {/* Gợi ý sử dụng bản đồ */}
        <p className="mt-1 text-xs text-ink-400">
          {t('map.satelliteHint')}
        </p>

        {/* Ghi chú bổ sung */}
        {note ? (
          <p className="mt-2 text-xs font-medium text-navy-800">
            {note}
          </p>
        ) : null}
      </div>

      {/* Thông báo lỗi GPS */}
      {gpsMessage ? (
        <p className="text-sm text-red-700">
          {gpsMessage}
        </p>
      ) : null}

      {/* Thông báo lỗi hoặc trạng thái khác */}
      {notice ? (
        <p className="text-sm text-red-700">
          {notice}
        </p>
      ) : null}

      {/* Nút hủy và xác nhận */}
      {onSave || onCancel ? (
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              {t('common.cancel')}
            </Button>
          ) : null}

          <Button
            type="button"
            disabled={busy || confirmed || !origin.source}
            onClick={confirmLocation}
          >
            {t('map.confirm')}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={busy || confirmed || !origin.source}
            onClick={confirmLocation}
          >
            {t('map.confirm')}
          </Button>
        </div>
      )}
    </div>
  </div>
);
}
