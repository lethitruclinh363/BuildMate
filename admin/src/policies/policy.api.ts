import { api, getApiErrorMessage } from '@/services/api';
import type { ApiResponse } from '@/types/api';

export const POLICY_TYPES = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'CUSTOMER_POLICY',
  'CONTRACTOR_POLICY',
  'MATERIAL_STORE_POLICY',
  'PAYMENT_POLICY',
  'REFUND_POLICY',
  'COMMUNITY_GUIDELINE',
] as const;

export const POLICY_STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE'] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export type PolicyRecord = {
  id: string;
  title: string;
  type: PolicyType;
  content?: string;
  language: 'vi' | 'en';
  version: string;
  status: PolicyStatus;
  effectiveDate: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PolicyRevision = {
  id: string;
  policyId: string;
  title: string;
  type: PolicyType;
  content: string;
  language: 'vi' | 'en';
  version: string;
  status: PolicyStatus;
  effectiveDate: string | null;
  createdAt: string;
};

export type PolicyInput = {
  title: string;
  type: PolicyType;
  content: string;
  language: 'vi' | 'en';
  version: string;
  status: PolicyStatus;
  effectiveDate?: string;
};

function unwrap<T>(payload: ApiResponse<T>) {
  return payload.data;
}

export const policyApi = {
  async list(params: { search?: string; type?: string; status?: string; language?: string }) {
    const { data } = await api.get<ApiResponse<PolicyRecord[]>>('/policies', { params });
    return unwrap(data);
  },
  async get(id: string) {
    const { data } = await api.get<ApiResponse<PolicyRecord>>(`/policies/${id}`);
    return unwrap(data);
  },
  async create(body: PolicyInput) {
    const { data } = await api.post<ApiResponse<PolicyRecord>>('/policies', body);
    return unwrap(data);
  },
  async update(id: string, body: Partial<PolicyInput>) {
    const { data } = await api.patch<ApiResponse<PolicyRecord>>(`/policies/${id}`, body);
    return unwrap(data);
  },
  async history(id: string) {
    const { data } = await api.get<ApiResponse<PolicyRevision[]>>(`/policies/${id}/history`);
    return unwrap(data);
  },
};

export { getApiErrorMessage };
