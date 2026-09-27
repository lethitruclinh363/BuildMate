import { create } from 'zustand';

interface OrderLiveState {
  version: number;
  lastEvent: string | null;
  bump: (event: string) => void;
}

export const useOrderLiveStore = create<OrderLiveState>((set) => ({
  version: 0,
  lastEvent: null,
  bump: (event) => set((state) => ({ version: state.version + 1, lastEvent: event })),
}));
