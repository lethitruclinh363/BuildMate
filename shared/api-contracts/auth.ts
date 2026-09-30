import type { ApiResponse, AuthPayload, User } from '../types/user';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  phone?: string;
  acceptedPolicy: true;
  policyLanguage?: 'vi' | 'en';
  role: 'CUSTOMER' | 'CONTRACTOR' | 'MATERIAL_STORE_OWNER';
}

export type LoginResponse = ApiResponse<AuthPayload>;
export type ProfileResponse = ApiResponse<User>;
