import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  link?: string;
  prominent?: boolean;
}

interface ToastState {
  items: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'> & { id?: string; durationMs?: number }) => void;
  dismiss: (id: string) => void;
}

const seenToastIds = new Set<string>();

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (toast) => {
    const provided = toast.id;
    if (provided && seenToastIds.has(provided)) return;
    const id = provided || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (provided) seenToastIds.add(provided);
    set((state) => ({ items: [...state.items, { ...toast, id }].slice(-5) }));
    window.setTimeout(() => {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
    }, toast.durationMs ?? 4200);
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));
