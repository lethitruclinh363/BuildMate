import { useCallback, useState } from 'react';
import { CAN_THO } from '@/types/marketplace';

export interface MapOrigin {
  lat: number;
  lng: number;
  label?: string;
}

export function useCurrentLocation() {
  const [origin, setOrigin] = useState<MapOrigin>(CAN_THO);
  const [status, setStatus] = useState<'idle' | 'asking' | 'ready' | 'denied'>('idle');

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('denied');
      return;
    }
    setStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'GPS',
        });
        setStatus('ready');
      },
      () => {
        setOrigin({ ...CAN_THO, label: 'Can Tho centre' });
        setStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  return { origin, setOrigin, locate, status };
}
