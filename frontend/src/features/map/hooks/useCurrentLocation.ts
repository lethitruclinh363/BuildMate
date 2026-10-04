import { useCallback, useState } from 'react';
import { rememberGpsOrigin, requestCurrentPosition, type GeoErrorKind } from '@/features/map/lib/location';
import { CAN_THO } from '@/types/marketplace';

export interface MapOrigin {
  lat: number;
  lng: number;
  label?: string;
}

export type GpsStatus = 'idle' | 'asking' | 'ready' | GeoErrorKind;

export function useCurrentLocation() {
  const [origin, setOrigin] = useState<MapOrigin>(CAN_THO);
  const [status, setStatus] = useState<GpsStatus>('idle');

  const locate = useCallback(() => {
    setStatus('asking');
    requestCurrentPosition()
      .then((point) => {
        rememberGpsOrigin(point);
        setOrigin({ ...point, label: 'GPS' });
        setStatus('ready');
      })
      .catch((err: { kind?: GeoErrorKind }) => {
        setStatus(err.kind === 'denied' ? 'denied' : 'unavailable');
      });
  }, []);

  return { origin, setOrigin, locate, status };
}
