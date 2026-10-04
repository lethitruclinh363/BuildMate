import { useEffect, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LocationPicker } from '@/features/map/components/LocationPicker';
import { LocationViewer } from '@/features/map/components/LocationViewer';
import type { MapOrigin } from '@/features/map/hooks/useCurrentLocation';
import { formatCoordinates, rememberGpsOrigin, requestCurrentPosition, type GeoErrorKind } from '@/features/map/lib/location';
import { reverseGeocode } from '@/features/map/services/geocoding';
import { useI18n } from '@/locales';
import { CAN_THO } from '@/types/marketplace';

export interface ChatLocationDraft {
  lat: number;
  lng: number;
  address: string;
  label: string;
}

export function SendLocationModal({
  open,
  busy,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (location: ChatLocationDraft) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'choose' | 'map' | 'confirm'>('choose');
  const [draft, setDraft] = useState<ChatLocationDraft | null>(null);
  const [pin, setPin] = useState<MapOrigin>(CAN_THO);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState('');

  useEffect(() => {
    if (!open) {
      setMode('choose');
      setDraft(null);
      setPin(CAN_THO);
      setGpsError('');
      setLocating(false);
    }
  }, [open]);

  function keep(next: MapOrigin) {
    setDraft({
      lat: next.lat,
      lng: next.lng,
      address: next.label || '',
      label: next.label || '',
    });
    setMode('confirm');
  }

  async function useCurrent() {
    setLocating(true);
    setGpsError('');
    try {
      const point = await requestCurrentPosition();
      rememberGpsOrigin(point);
      let label = '';
      try {
        const hit = await reverseGeocode(point.lat, point.lng);
        label = hit?.label || '';
      } catch {
        label = '';
      }
      setDraft({ lat: point.lat, lng: point.lng, address: label, label });
      setMode('confirm');
    } catch (err) {
      const kind = (err as { kind?: GeoErrorKind }).kind;
      setGpsError(kind === 'denied' ? t('chat.gpsDenied') : t('chat.gpsUnavailable'));
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('chat.sendLocation')} size="lg">
      {mode === 'choose' ? (
        <div className="grid gap-3">
          <Button type="button" variant="copper" loading={locating} onClick={() => void useCurrent()}>
            <Navigation className="h-4 w-4" /> {t('chat.useCurrent')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode('map')}>
            <MapPin className="h-4 w-4" /> {t('chat.pickOnMap')}
          </Button>
          {gpsError ? <p className="text-sm text-red-700">{gpsError}</p> : null}
        </div>
      ) : null}
      {mode === 'map' ? (
        <LocationPicker variant="panel" origin={pin} onPick={setPin} onSave={keep} onCancel={() => setMode('choose')} />
      ) : null}
      {mode === 'confirm' && draft ? (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.16em] text-copper-500">{t('chat.selected')}</p>
          <p className="font-semibold text-navy-800">{draft.label || draft.address || t('chat.locationFallback')}</p>
          {draft.address && draft.address !== draft.label ? <p className="text-sm text-ink-500">{draft.address}</p> : null}
          <p className="text-xs text-ink-400">{formatCoordinates(draft.lat, draft.lng)}</p>
          <LocationViewer lat={draft.lat} lng={draft.lng} compact />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('choose')}>
              {t('common.cancel')}
            </Button>
            <Button type="button" loading={busy} onClick={() => onSend(draft)}>
              {t('chat.sendLocation')}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
