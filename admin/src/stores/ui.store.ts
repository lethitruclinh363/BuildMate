import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdminTheme = 'dark' | 'oled';

interface UiState {
  collapsed: boolean;
  mobileOpen: boolean;
  theme: AdminTheme;
  searchOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (value: boolean) => void;
  setMobileOpen: (value: boolean) => void;
  setTheme: (theme: AdminTheme) => void;
  setSearchOpen: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      collapsed: false,
      mobileOpen: false,
      theme: 'dark',
      searchOpen: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
      setTheme: (theme) => set({ theme }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
    }),
    {
      name: 'buildmate-admin-ui',
      partialize: (s) => ({ collapsed: s.collapsed, theme: s.theme }),
    }
  )
);

export function applyAdminTheme(theme: AdminTheme) {
  document.documentElement.dataset.theme = theme;
}
