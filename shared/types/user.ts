export type UserRole = 'CUSTOMER' | 'CONTRACTOR' | 'MATERIAL_STORE_OWNER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_VERIFICATION' | 'BANNED';

export type ProfileStatus =
  | 'INCOMPLETE'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneNumber?: string;
  acceptedPolicy?: boolean;
  acceptedPolicyVersion?: string;
  acceptedPolicyAt?: string | null;
  avatar: string;
  role: UserRole;
  status: UserStatus;
  profileStatus?: ProfileStatus;
  createdAt: string;
  updatedAt: string;
  preferredLanguage?: 'vi' | 'en';
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  details?: unknown;
  errors?: unknown;
}

export interface AuthPayload {
  user: User;
  token: string;
}
