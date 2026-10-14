import { useCallback, useRef, useState } from 'react';
import { hasCoordinates, rememberGpsOrigin, requestCurrentPosition, type GeoErrorKind } from '@/features/map/lib/location';
import { originFromPlace, reverseGeocode } from '@/features/map/services/geocoding';
import type { MapOrigin } from '@/features/map/types';
import { CAN_THO } from '@/types/marketplace';

export type { MapOrigin };

export type GpsStatus = 'idle' | 'asking' | 'ready' | GeoErrorKind;

export function useCurrentLocation(initial?: MapOrigin) {
  const [origin, setOrigin] = useState<MapOrigin>(initial || CAN_THO);
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [reverseFailed, setReverseFailed] = useState(false);
  const request = useRef(0);

  const locate = useCallback(() => {
    const id = request.current + 1;
    request.current = id;
    setStatus('asking');
    setReverseFailed(false);
    requestCurrentPosition()
      .then(async (point) => {
        if (request.current !== id) return;
        if (!hasCoordinates(point.lat, point.lng)) {
          setStatus('unavailable');
          return;
        }
        rememberGpsOrigin(point);
        setOrigin({ lat: point.lat, lng: point.lng, source: 'GPS' });
        setStatus('ready');
        try {
          const hit = await reverseGeocode(point.lat, point.lng);
          if (request.current !== id) return;
          const next = originFromPlace({ ...hit, lat: point.lat, lng: point.lng }, 'GPS');
          setOrigin(next.label ? next : { lat: point.lat, lng: point.lng, source: 'GPS' });
        } catch {
          if (request.current !== id) return;
          setReverseFailed(true);
        }
      })
      .catch((err: { kind?: GeoErrorKind }) => {
        if (request.current !== id) return;
        setStatus(err.kind === 'denied' ? 'denied' : 'unavailable');
      });
  }, []);

  return { origin, setOrigin, locate, status, reverseFailed };
}
