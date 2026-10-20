import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useToastStore } from '@/store/toast.store';
import { t, translateApiError } from '@/locales';

declare module 'axios' {
  interface AxiosRequestConfig {
    silent?: boolean;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 8000,
});

type ApiErrorBody = {
  message?: string;
  code?: string;
  field?: string | string[];
  details?: { code?: string; field?: string | string[]; conflicts?: Array<{ code?: string; field?: string; message?: string }> };
};

export function getApiErrorPayload(error: unknown) {
  const ax = error as AxiosError<ApiErrorBody>;
  const data = ax.response?.data;
  const field = data?.field ?? data?.details?.field;
  const fields = Array.isArray(field) ? field : field ? [field] : [];
  const conflicts = data?.details?.conflicts || [];
  for (const item of conflicts) {
    if (item.field && !fields.includes(item.field)) fields.push(item.field);
  }
  return {
    message: getApiErrorMessage(error),
    code: data?.code || data?.details?.code || '',
    field: fields[0] || '',
    fields,
  };
}

export function getApiErrorMessage(error: unknown) {
  const ax = error as AxiosError<ApiErrorBody>;
  if (ax.code === 'ECONNABORTED' || ax.code === 'ERR_NETWORK' || !ax.response) {
    return t('feedback.network');
  }
  return translateApiError(ax.response.data?.message);
}

api.interceptors.request.use((config) => {
  const standalone = localStorage.getItem('buildmate-token');
  if (standalone) {
    config.headers.Authorization = `Bearer ${standalone}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string }>) => {
    if (
      axios.isCancel(error) ||
      error.code === 'ERR_CANCELED' ||
      error.name === 'CanceledError' ||
      error.name === 'AbortError'
    ) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const url = error.config?.url || '';
    const silent = (error.config as InternalAxiosRequestConfig & { silent?: boolean })?.silent;
    const onAuthPage = window.location.pathname.startsWith('/login')
      || window.location.pathname.startsWith('/register')
      || window.location.pathname.startsWith('/verify-email')
      || window.location.pathname.startsWith('/forgot-password');

    if (
      status === 401 &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/register') &&
      !url.includes('/auth/verify-email') &&
      !url.includes('/auth/resend-code') &&
      !url.includes('/auth/forgot-password') &&
      !url.includes('/auth/verify-reset-code') &&
      !url.includes('/auth/reset-password') &&
      !url.includes('/auth/logout')
    ) {
      localStorage.removeItem('buildmate-auth');
      localStorage.removeItem('buildmate-token');
      localStorage.removeItem('buildmate-user');
      // Không window.location.assign — tránh reload treo. Router tự đẩy về /login.
    }

    if (!silent && !onAuthPage && (!error.response || status === 500)) {
      useToastStore.getState().push({
        kind: 'error',
        title: t('feedback.errorTitle'),
        body: getApiErrorMessage(error),
      });
    }

    return Promise.reject(error);
  }
);
