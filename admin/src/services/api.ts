import axios, { type AxiosError } from 'axios';
import type { ApiResponse } from '@/types/api';
import i18n from '@/locales/i18n';
import { useToastStore } from '@/stores/toast.store';

const AUTH_KEY = 'buildmate-admin-auth';

let last429ToastAt = 0;

export function readAdminToken() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed.state?.token || null;
  } catch {
    return null;
  }
}

export function clearAdminSessionStorage() {
  localStorage.removeItem(AUTH_KEY);
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  timeout: 20000,
});

export function getApiErrorMessage(error: unknown) {
  const ax = error as AxiosError<ApiResponse<null>>;
  if (ax.response?.status === 429) return i18n.t('errors.rateLimit');
  if (!ax.response) return i18n.t('errors.network');
  return ax.response.data?.message || i18n.t('errors.failed');
}

function toastRateLimit() {
  const now = Date.now();
  if (now - last429ToastAt < 4000) return;
  last429ToastAt = now;
  useToastStore.getState().push('warning', i18n.t('errors.rateLimit'));
}

api.interceptors.request.use((config) => {
  const token = readAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiResponse<null>>) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 429) {
      toastRateLimit();
    }
    if (status === 401 && !url.includes('/admin/auth/login')) {
      clearAdminSessionStorage();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export { AUTH_KEY };
