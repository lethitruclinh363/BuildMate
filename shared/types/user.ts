export type UserRole = 'CUSTOMER' | 'CONTRACTOR' | 'MATERIAL_STORE_OWNER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'DISABLED' | 'BANNED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  profileStatus?: string | null;
  avatar?: string;
  preferredLanguage?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface AuthPayload {
  token: string;
  user: User;
}
