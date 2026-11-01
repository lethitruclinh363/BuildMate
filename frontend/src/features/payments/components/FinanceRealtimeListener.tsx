import { useEffect } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';
import { useOrderLiveStore } from '@/features/orders/store/order-live.store';
import type { AppNotification } from '@/types/sprint4';

const TYPES = ['PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'NEW_REVIEW', 'NEW_COMPLAINT', 'COMPLAINT_UPDATED'] as const;

export function FinanceRealtimeListener() {
  const { socket } = useSocket();
  const { t } = useI18n();
  const push = useToastStore((s) => s.push);
  const bump = useOrderLiveStore((s) => s.bump);

  useEffect(() => {
    if (!socket) return;
    const handler = (n: AppNotification) => {
      if (!TYPES.includes(n.type as (typeof TYPES)[number])) return;
      bump(n.type);
      push({
        id: n.id ? `notification:${n.id}` : undefined,
        kind: n.type === 'PAYMENT_FAILED' ? 'error' : 'success',
        title: t(`toast.${n.type}`),
        body: n.message,
      });
    };
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [socket, bump, push, t]);

  return null;
}
