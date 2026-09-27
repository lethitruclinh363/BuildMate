import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type {
  CatalogMaterial,
  CatalogService,
  ContractorProfile,
  DocumentType,
  Storefront,
  WorkspacePayload,
} from '@/types/partner';
import type { ContractorDashboardStats } from '@/features/analytics/types/dashboard-stats';

const origin = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

export function mediaUrl(url?: string) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:')) return url;
  return `${origin}${url}`;
}

export function vnd(value: number) {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  const formatted = new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value || 0);
  return english ? `${formatted} VND` : `${formatted}đ`;
}

export const contractorApi = {
  workspace: () => api.get<ApiResponse<WorkspacePayload>>('/contractor/workspace'),
  dashboardStats: () => api.get<ApiResponse<ContractorDashboardStats>>('/contractor/dashboard-stats'),
  saveProfile: (body: Partial<ContractorProfile>) =>
    api.patch<ApiResponse<ContractorProfile>>('/contractor/profile', body),
  uploadDocument: (file: File, type: DocumentType) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    return api.post<ApiResponse<ContractorProfile>>('/contractor/verification/documents', form, {
      timeout: 60000,
    });
  },
  removeDocument: (id: string) =>
    api.delete<ApiResponse<ContractorProfile>>(`/contractor/verification/documents/${id}`),
  submit: () => api.post<ApiResponse<ContractorProfile>>('/contractor/verification/submit'),
  getStore: () => api.get<ApiResponse<Storefront | null>>('/contractor/store'),
  createStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.post<ApiResponse<Storefront>>('/contractor/store', body),
  updateStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.patch<ApiResponse<Storefront>>('/contractor/store', body),
  listServices: () => api.get<ApiResponse<CatalogService[]>>('/contractor/services'),
  saveService: (body: Partial<CatalogService>, id?: string) =>
    id
      ? api.patch<ApiResponse<CatalogService>>(`/contractor/services/${id}`, body)
      : api.post<ApiResponse<CatalogService>>('/contractor/services', body),
  deleteService: (id: string) => api.delete(`/contractor/services/${id}`),
};

export const materialStoreApi = {
  workspace: () =>
    api.get<ApiResponse<{ profile: ContractorProfile; store: Storefront | null; approved: boolean }>>(
      '/material-store/workspace'
    ),
  saveProfile: (body: Partial<ContractorProfile>) =>
    api.patch<ApiResponse<ContractorProfile>>('/material-store/profile', body),
  uploadDocument: (file: File, type: DocumentType) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    return api.post<ApiResponse<ContractorProfile>>('/material-store/verification/documents', form, {
      timeout: 60000,
    });
  },
  removeDocument: (id: string) =>
    api.delete<ApiResponse<ContractorProfile>>(`/material-store/verification/documents/${id}`),
  submit: () => api.post<ApiResponse<ContractorProfile>>('/material-store/verification/submit'),
  getStore: () => api.get<ApiResponse<Storefront | null>>('/material-store/store'),
  createStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.post<ApiResponse<Storefront>>('/material-store/store', body),
  updateStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.patch<ApiResponse<Storefront>>('/material-store/store', body),
  listMaterials: () => api.get<ApiResponse<CatalogMaterial[]>>('/material-store/materials'),
  saveMaterial: (body: Partial<CatalogMaterial>, id?: string) =>
    id
      ? api.patch<ApiResponse<CatalogMaterial>>(`/material-store/materials/${id}`, body)
      : api.post<ApiResponse<CatalogMaterial>>('/material-store/materials', body),
  deleteMaterial: (id: string) => api.delete(`/material-store/materials/${id}`),
};
