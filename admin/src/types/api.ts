export type UserRole = 'CUSTOMER' | 'CONTRACTOR' | 'MATERIAL_STORE_OWNER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_VERIFICATION' | 'BANNED';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  details?: unknown;
  errors?: unknown;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  preferredLanguage?: 'vi' | 'en';
}

export interface AuthPayload {
  user: User;
  token: string;
}

export class AdminForbiddenError extends Error {
  readonly status = 403;

  constructor(message = 'Forbidden: ADMIN role required') {
    super(message);
    this.name = 'AdminForbiddenError';
  }
}
