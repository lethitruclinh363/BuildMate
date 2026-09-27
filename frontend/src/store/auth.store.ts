import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import type { AuthPayload, User } from '@/types/user';
import type { ApiResponse } from '@/types/user';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  setSession: (payload: AuthPayload) => void;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  dashboardPath: () => string;
}

const APP_ROLES = ['CUSTOMER', 'CONTRACTOR', 'MATERIAL_STORE_OWNER'] as const;

export const roleHome: Record<(typeof APP_ROLES)[number], string> = {
  CUSTOMER: '/customer/dashboard',
  CONTRACTOR: '/contractor/dashboard',
  MATERIAL_STORE_OWNER: '/store/dashboard',
};

function isAppRole(role?: string | null): role is (typeof APP_ROLES)[number] {
  return Boolean(role && role in roleHome);
}

export function homeForRole(role?: string | null) {
  return isAppRole(role) ? roleHome[role] : '/login';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: true,
      setSession: ({ user, token }) => {
        if (!isAppRole(user?.role)) {
          set({ user: null, token: null, loading: false });
          return;
        }
        set({ user, token, loading: false });
      },
      logout: async () => {
        try {
          if (get().token) await api.post('/auth/logout');
        } catch {
          /* client still clears session */
        }
        set({ user: null, token: null, loading: false });
      },
      restore: async () => {
        const token = get().token;
        if (!token) {
          set({ loading: false });
          return;
        }
        try {
          const { data } = await api.get<ApiResponse<User>>('/user/profile');
          if (!isAppRole(data.data?.role)) {
            set({ user: null, token: null, loading: false });
            return;
          }
          set({ user: data.data, loading: false });
        } catch {
          set({ user: null, token: null, loading: false });
        }
      },
      dashboardPath: () => homeForRole(get().user?.role),
    }),
    {
      name: 'buildmate-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.user && !isAppRole(state.user.role)) {
          state.user = null;
          state.token = null;
        }
      },
    }
  )
);
