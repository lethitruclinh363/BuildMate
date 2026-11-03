import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { authApi, type GoogleLoginBody, type GoogleLoginResult } from '@/services/auth.api';
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
  phoneNumber: string;
  password: string;
  role: string;
  acceptedPolicy: true;
  policyLanguage: 'vi' | 'en';
};

type AuthContextValue = {
  currentUser: User | null;
  token: string | null;
  ready: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthPayload>;
  googleLogin: (body: GoogleLoginBody) => Promise<GoogleLoginResult>;
  logout: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<ApiResponse<{ emailSent?: boolean } | null>>;
  refreshUser: () => Promise<User | null>;
  dashboardPath: () => string;
};

function isAppRole(role?: string | null): role is RoleHomeKey {
  return Boolean(role && role in ROLE_HOME);
}

function dashboardPathFor(role?: string | null) {
  if (!isAppRole(role)) return '/login';
  return ROLE_HOME[role];
}

export function isPartnerRole(role?: string | null) {
  return role === 'CONTRACTOR' || role === 'MATERIAL_STORE_OWNER' || role === 'STORE';
}

export function needsOnboarding(user: { role?: string | null; profileStatus?: string | null } | null) {
  if (!user || !isPartnerRole(user.role)) return false;
  return user.profileStatus !== 'APPROVED';
}

export function partnerGatePath(user: { role?: string | null; profileStatus?: string | null } | null) {
  if (!needsOnboarding(user)) return null;
  if (
    user?.profileStatus === 'SUBMITTED' ||
    user?.profileStatus === 'PENDING_APPROVAL' ||
    user?.profileStatus === 'REJECTED'
  ) {
    return '/partner/onboarding/status';
  }
  return '/partner/onboarding';
}

export function homeForUser(user: { role?: string | null; profileStatus?: string | null } | null) {
  if (!user?.role) return '/login';
  return partnerGatePath(user) || dashboardPathFor(user.role);
}

/** Workspace home after login or session restore. Never the public landing page. */
export function getDefaultRouteByRole(user: { role?: string | null; profileStatus?: string | null } | null | undefined) {
  if (!user?.role) return '/login';
  return homeForUser(user);
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

  const googleLogin = useCallback(async (body: GoogleLoginBody) => {
    const { data } = await authApi.googleLogin(body);
    const result = data.data;
    if (result.requiresRegistration) return result;
    if (result.user.role !== 'CUSTOMER') {
      applySession(null, null);
      throw new Error(t('auth.wrongRole'));
    }
    applySession(result.token, result.user);
    return result;
  }, [applySession]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { data } = await authApi.register(payload);
    return data;
  }, []);

  const refreshUser = useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return null;
    const { data } = await api.get<ApiResponse<User>>('/user/profile', { silent: true });
    applySession(saved, data.data);
    return data.data;
  }, [applySession]);

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
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        if (!cancelled && (status === 401 || status === 403)) {
          applySession(null, null);
        }
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
    function onSessionCleared() {
      applySession(null, null);
    }
    window.addEventListener('buildmate-session-cleared', onSessionCleared);
    return () => window.removeEventListener('buildmate-session-cleared', onSessionCleared);
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
      googleLogin,
      logout,
      register,
      refreshUser,
      dashboardPath: () => homeForUser(currentUser),
    }),
    [currentUser, token, ready, loading, login, googleLogin, logout, register, refreshUser]
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
