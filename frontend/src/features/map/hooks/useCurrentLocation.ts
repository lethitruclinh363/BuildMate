import { useCallback, useState } from 'react';
import {
  rememberGpsOrigin,
  requestCurrentPosition,
  type GeoErrorKind,
} from '@/features/map/lib/location';
import { CAN_THO } from '@/types/marketplace';

const LOCATION_STORAGE_KEY = 'buildmate:map-origin';

export interface MapOrigin {
  lat: number;
  lng: number;
  label?: string;
}

function readSavedOrigin(): MapOrigin | null {
  try {
    const value = sessionStorage.getItem(LOCATION_STORAGE_KEY);
    if (!value) return null;

    const origin = JSON.parse(value) as MapOrigin;

    if (
      Number.isFinite(origin.lat) &&
      origin.lat >= -90 &&
      origin.lat <= 90 &&
      Number.isFinite(origin.lng) &&
      origin.lng >= -180 &&
      origin.lng <= 180
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

export type GpsStatus = 'idle' | 'asking' | 'ready' | GeoErrorKind;

export function useCurrentLocation() {
  const [origin, setOriginState] = useState<MapOrigin>(
    () => readSavedOrigin() || CAN_THO
  );

  const [status, setStatus] = useState<GpsStatus>('idle');

  const setOrigin = useCallback((next: MapOrigin) => {
    setOriginState(next);

    try {
      sessionStorage.setItem(
        LOCATION_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {}
  }, []);

  const locate = useCallback(() => {
    setStatus('asking');

    requestCurrentPosition()
      .then((point) => {
        rememberGpsOrigin(point);
        setOrigin({ ...point, label: 'GPS' });
        setStatus('ready');
      })
      .catch((err: { kind?: GeoErrorKind }) => {
        setStatus(
          err.kind === 'denied' ? 'denied' : 'unavailable'
        );
      });
  }, [setOrigin]);

  return {
    origin,
    setOrigin,
    locate,
    status,
  };
}