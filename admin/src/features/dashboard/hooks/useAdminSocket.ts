import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/auth/auth.store';
import { socketOrigin } from '@/features/dashboard/services/dashboard.api';

export function useAdminSocket() {
  const token = useAuthStore((s) => s.token);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }
    const instance: Socket = io(socketOrigin(), {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      timeout: 4000,
    });
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    instance.on('connect', on);
    instance.on('disconnect', off);
    instance.on('connect_error', off);
    return () => {
      instance.off('connect', on);
      instance.off('disconnect', off);
      instance.disconnect();
    };
  }, [token]);

  return connected;
}
