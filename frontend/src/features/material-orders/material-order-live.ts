import { useEffect } from 'react';
import { create } from 'zustand';
import { useSocket } from '@/providers/SocketProvider';

export const useMaterialOrderLiveStore = create<{ tick: number; bump: () => void }>((set) => ({
  tick: 0,
  bump: () => set((state) => ({ tick: state.tick + 1 })),
}));

export function MaterialOrderLiveListener() {
  const { socket } = useSocket();
  const bump = useMaterialOrderLiveStore((state) => state.bump);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => bump();
    socket.on('material_order_updated', onUpdate);
    return () => {
      socket.off('material_order_updated', onUpdate);
    };
  }, [socket, bump]);

  return null;
}
