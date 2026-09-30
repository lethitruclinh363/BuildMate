import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { adminApi } from '@/services/admin.api';
import { AUTH_KEY, clearAdminSessionStorage } from '@/services/api';
import { loginAdmin } from '@/auth/auth.service';
import { AdminForbiddenError, type User } from '@/types/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: true,
      login: async (email, password) => {
        const payload = await loginAdmin(email, password);
        set({ user: payload.user, token: payload.token, loading: false });
      },
      logout: async () => {
        try {
          if (get().token) await adminApi.logout();
        } catch {
          /* still clear local session */
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
          const user = await adminApi.getProfile();
          if (user.role !== 'ADMIN') {
            clearAdminSessionStorage();
            set({ user: null, token: null, loading: false });
            throw new AdminForbiddenError();
          }
          set({ user, loading: false });
        } catch (error) {
          if (error instanceof AdminForbiddenError) {
            set({ user: null, token: null, loading: false });
            return;
          }
          set({ user: null, token: null, loading: false });
        }
      },
    }),
    {
      name: AUTH_KEY,
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
