import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { authApi } from '@/services/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { setAppLanguage, t } from '@/locales';
import type { ApiResponse, AuthPayload, User } from '@/types/user';

const TOKEN_KEY = 'buildmate-token';
const USER_KEY = 'buildmate-user';

/** Dashboard của app người dùng: Customer, Contractor, Material Store Owner. */
export const ROLE_HOME = {
  CUSTOMER: '/customer/dashboard',
  CONTRACTOR: '/contractor/dashboard',
  MATERIAL_STORE_OWNER: '/store/dashboard',
  STORE: '/store/dashboard',
} as const;

export type RoleHomeKey = keyof typeof ROLE_HOME;

type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
};

type AuthContextValue = {
  currentUser: User | null;
  token: string | null;
  ready: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthPayload>;
  logout: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<ApiResponse<{ emailSent?: boolean } | null>>;
  dashboardPath: () => string;
};

function isAppRole(role?: string | null): role is RoleHomeKey {
  return Boolean(role && role in ROLE_HOME);
}

function dashboardPathFor(role?: string | null) {
  if (!isAppRole(role)) return '/login';
  return ROLE_HOME[role];
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    if (!isAppRole(user?.role)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function persist(token: string | null, user: User | null) {
  let nextToken = token;
  let nextUser = user;
  if (nextUser && !isAppRole(nextUser.role)) {
    nextToken = null;
    nextUser = null;
  }
  if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
  else localStorage.removeItem(TOKEN_KEY);
  if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  else localStorage.removeItem(USER_KEY);
  useAuthStore.setState({ token: nextToken, user: nextUser, loading: false });
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return readStoredUser();
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const ready = !loading;

  const applySession = useCallback((nextToken: string | null, nextUser: User | null) => {
    let tokenValue = nextToken;
    let userValue = nextUser;
    if (userValue && !isAppRole(userValue.role)) {
      tokenValue = null;
      userValue = null;
    }
    setToken(tokenValue);
    setCurrentUser(userValue);
    persist(tokenValue, userValue);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await authApi.login(email, password);
      const session = data.data;
      if (!isAppRole(session.user?.role)) {
        applySession(null, null);
        throw new Error(t('auth.wrongRole'));
      }
      applySession(session.token, session.user);
      return session;
    },
    [applySession]
  );

  const register = useCallback(async (payload: RegisterPayload) => {
    const { data } = await authApi.register(payload);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    try {
      if (saved) await authApi.logout();
    } catch {
      /* vẫn xóa session local */
    }
    applySession(null, null);
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (!saved) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get<ApiResponse<User>>('/user/profile', {
          silent: true,
          timeout: 5000,
        });
        if (cancelled) return;
        if (!isAppRole(data.data?.role)) {
          applySession(null, null);
        } else {
          applySession(saved, data.data);
        }
      } catch {
        if (!cancelled) applySession(null, null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    const lang = currentUser?.preferredLanguage;
    if (lang === 'vi' || lang === 'en') {
      void setAppLanguage(lang);
    }
  }, [currentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      token,
      ready,
      loading,
      login,
      logout,
      register,
      dashboardPath: () => dashboardPathFor(currentUser?.role),
    }),
    [currentUser, token, ready, loading, login, logout, register]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

export function useAuthReady() {
  const ctx = useContext(AuthContext);
  return ctx?.ready ?? false;
}
