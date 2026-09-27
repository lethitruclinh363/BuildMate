import { api } from '@/lib/api';
import type { ApiResponse, AuthPayload } from '@/types/user';

export type RegisterBody = {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
};

/** Service API cho Sprint 1 Auth. Page → service → Axios → backend. */
export const authApi = {
  register(body: RegisterBody) {
    return api.post<ApiResponse<{ emailSent?: boolean } | null>>('/auth/register', body, { silent: true });
  },

  login(email: string, password: string) {
    return api.post<ApiResponse<AuthPayload>>('/auth/login', { email, password }, { silent: true });
  },

  verifyEmail(email: string, code: string) {
    return api.post<ApiResponse<null>>('/auth/verify-email', { email, code }, { silent: true });
  },

  resendCode(email: string) {
    return api.post<ApiResponse<{ emailSent?: boolean } | null>>('/auth/resend-code', { email }, { silent: true });
  },

  forgotPassword(email: string) {
    return api.post<ApiResponse<{ emailSent?: boolean } | null>>('/auth/forgot-password', { email }, { silent: true });
  },

  verifyResetCode(email: string, code: string) {
    return api.post<ApiResponse<null>>('/auth/verify-reset-code', { email, code }, { silent: true });
  },

  resetPassword(email: string, code: string, newPassword: string) {
    return api.post<ApiResponse<null>>(
      '/auth/reset-password',
      { email, code, newPassword },
      { silent: true }
    );
  },

  logout() {
    return api.post('/auth/logout');
  },
};
