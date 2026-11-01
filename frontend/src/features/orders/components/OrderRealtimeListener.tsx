import { useEffect } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { useToastStore } from '@/store/toast.store';
import { useOrderLiveStore } from '../store/order-live.store';
import type { Order } from '../types/order.types';

const EVENTS = [
  'order_created',
  'order_completed',
  'contractor_accepted_job',
  'contractor_started_job',
  'contractor_updated_progress',
  'contractor_completed_job',
] as const;

export function OrderRealtimeListener() {
  const { socket } = useSocket();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const push = useToastStore((s) => s.push);
  const bump = useOrderLiveStore((s) => s.bump);

  useEffect(() => {
    if (!socket) return;

    const handlers = EVENTS.map((event) => {
      const handler = (payload: { order?: Order; actorId?: string; progress?: { id?: string } }) => {
        bump(event);
        if (payload?.actorId && user?.id && String(payload.actorId) === String(user.id)) return;
        const entityId = payload?.order?.id || payload?.progress?.id || '';
        const title = t(`orders.toast.${event}`);
        push({
          id: `${event}:${entityId}`,
          kind: event === 'order_completed' || event === 'contractor_completed_job' ? 'success' : 'info',
          title,
        });
      };
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      handlers.forEach(({ event, handler }) => socket.off(event, handler));
    };
  }, [socket, bump, push, t, user?.id]);

  return null;
}
