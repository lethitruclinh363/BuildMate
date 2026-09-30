import { api } from '@/services/api';
import { AdminForbiddenError, type ApiResponse, type AuthPayload, type User } from '@/types/api';

export async function loginAdmin(email: string, password: string): Promise<AuthPayload> {
  const { data } = await api.post<ApiResponse<AuthPayload>>('/admin/auth/login', { email, password });
  const payload = data.data;
  if (payload.user.role !== 'ADMIN') {
    throw new AdminForbiddenError();
  }
  return payload;
}

export function assertAdminUser(user: User | null): user is User {
  return Boolean(user && user.role === 'ADMIN');
}
