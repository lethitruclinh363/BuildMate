import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type {
  CatalogMaterial,
  StoreMaterialCategory,
  CatalogService,
  ContractorProfile,
  DocumentType,
  Storefront,
  ActivationReadiness,
  WorkspacePayload,
} from '@/types/partner';
import type { ContractorDashboardStats } from '@/features/analytics/types/dashboard-stats';
import type { PublicContractorProfile, PublicStoreProfile, PublicStoreReview } from '@/types/marketplace';
import type { ContractorServiceCategory, ContractorServicePick, ServiceNameCheck } from '@/data/contractor-services';
import type { MaterialCategoryCatalog, MaterialCategoryPick } from '@/data/material-categories';

const origin = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

export function mediaUrl(url?: string) {
  const value = (url || '').trim();
  if (!value) return '';
  if (value.startsWith('private:')) return '';
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  const filePath = value.startsWith('/') ? value : `/${value}`;
  return `${origin}${filePath}`;
}

/** A product photo the browser can request. A bare filename is not an image URL. */
export function productImageUrl(url?: string) {
  const value = (url || '').trim();
  if (!value) return '';
  if (/^(https?:|blob:|data:)/i.test(value) || value.startsWith('/uploads/')) return value;
  return '';
}

export function vnd(value: number) {
  const english = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  const formatted = new Intl.NumberFormat(english ? 'en-US' : 'vi-VN').format(value || 0);
  return english ? `${formatted} VND` : `${formatted}đ`;
}

export const contractorApi = {
  workspace: () => api.get<ApiResponse<WorkspacePayload>>('/contractor/workspace'),
  activate: () => api.post<ApiResponse<ActivationReadiness>>('/contractor/activation'),
  pauseListing: () => api.post<ApiResponse<ActivationReadiness>>('/contractor/activation/pause'),
  getProfile: () => api.get<ApiResponse<ContractorProfile>>('/contractor/profile'),
  getPublicProfile: () =>
    api.get<ApiResponse<{ publicProfile: PublicContractorProfile; services: CatalogService[] }>>('/contractor/public-profile'),
  savePublicProfile: (body: Partial<PublicContractorProfile>) =>
    api.patch<ApiResponse<PublicContractorProfile>>('/contractor/public-profile', body),
  requestVerificationChange: (note: string) =>
    api.post<ApiResponse<{ requested: boolean }>>('/contractor/verification/change-request', { note }),
  dashboardStats: () => api.get<ApiResponse<ContractorDashboardStats>>('/contractor/dashboard-stats'),
  saveProfile: (body: Partial<ContractorProfile>) =>
    api.patch<ApiResponse<ContractorProfile>>('/contractor/profile', body),
  uploadPortfolio: (file: File, slot: 'avatar' | 'teamLogo' | 'workshop' | 'construction' | 'certificate', onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    form.append('slot', slot);
    return api.post<ApiResponse<ContractorProfile>>('/contractor/portfolio', form, {
      timeout: 60000,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    });
  },
  removePortfolio: (slot: 'avatar' | 'teamLogo' | 'workshop' | 'construction' | 'certificate', url: string) =>
    api.delete<ApiResponse<ContractorProfile>>('/contractor/portfolio', { data: { slot, url } }),
  createPortfolioProject: () => api.post<ApiResponse<ContractorProfile>>('/contractor/portfolio/projects', {}),
  updatePortfolioProject: (projectId: string, body: { serviceId?: string; description?: string }) =>
    api.patch<ApiResponse<ContractorProfile>>(`/contractor/portfolio/projects/${projectId}`, body),
  deletePortfolioProject: (projectId: string) =>
    api.delete<ApiResponse<ContractorProfile>>(`/contractor/portfolio/projects/${projectId}`),
  uploadProjectImage: (projectId: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ApiResponse<ContractorProfile>>(`/contractor/portfolio/projects/${projectId}/images`, form, {
      timeout: 60000,
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    });
  },
  removeProjectImage: (projectId: string, url: string) =>
    api.delete<ApiResponse<ContractorProfile>>(`/contractor/portfolio/projects/${projectId}/images`, { data: { url } }),
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
  submit: () => api.post<ApiResponse<ContractorProfile>>('/contractor/verification/submit', { acceptedTerms: true }),
  getStore: () => api.get<ApiResponse<Storefront | null>>('/contractor/store'),
  createStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.post<ApiResponse<Storefront>>('/contractor/store', body),
  updateStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.patch<ApiResponse<Storefront>>('/contractor/store', body),
  listServices: () => api.get<ApiResponse<CatalogService[]>>('/contractor/services'),
  registerService: (catalogKey: string) =>
    api.post<ApiResponse<CatalogService>>('/contractor/services/register', { catalogKey }),
  saveService: (body: { basePrice: number; unit: CatalogService['unit']; estimatedHours?: number; description?: string; image?: string }, id: string) =>
    api.patch<ApiResponse<CatalogService>>(`/contractor/services/${id}`, body),
  setServiceAvailability: (id: string, isActive: boolean) =>
    api.patch<ApiResponse<CatalogService>>(`/contractor/services/${id}/availability`, { isActive }),
  deleteService: (id: string) => api.delete<ApiResponse<{ deleted: boolean; id: string }>>(`/contractor/services/${id}`),
  listServiceCatalog: () =>
    api.get<ApiResponse<ContractorServicePick[]>>('/contractor/service-catalog', { silent: true }),
  checkServiceCatalog: (name: string) =>
    api.get<ApiResponse<ServiceNameCheck>>('/contractor/service-catalog/check', { params: { name }, silent: true }),
  createCustomService: (body: { name: string; category: ContractorServiceCategory; description?: string }) =>
    api.post<ApiResponse<ContractorServicePick>>('/contractor/service-catalog/custom', body),
  createServiceSuggestion: (description: string) =>
    api.post<ApiResponse<{ id: string; status: string }>>('/service-suggestions', { description }),
};

export const materialStoreApi = {
  getProfile: () => api.get<ApiResponse<ContractorProfile>>('/material-store/profile'),
  workspace: () =>
    api.get<ApiResponse<{ profile: ContractorProfile; store: Storefront | null; approved: boolean; activation?: ActivationReadiness }>>(
      '/material-store/workspace'
    ),
  activate: () => api.post<ApiResponse<ActivationReadiness>>('/material-store/activation'),
  pauseListing: () => api.post<ApiResponse<ActivationReadiness>>('/material-store/activation/pause'),
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
  submit: () => api.post<ApiResponse<ContractorProfile>>('/material-store/verification/submit', { acceptedTerms: true }),
  getStore: () => api.get<ApiResponse<Storefront | null>>('/material-store/store'),
  createStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.post<ApiResponse<Storefront>>('/material-store/store', body),
  updateStore: (body: Partial<Storefront> & { lng?: number; lat?: number }) =>
    api.patch<ApiResponse<Storefront>>('/material-store/store', body),
  listMaterialCategories: () =>
    api.get<ApiResponse<MaterialCategoryCatalog>>('/material-store/categories', { silent: true }),
  createMaterialCategory: (name: string) =>
    api.post<ApiResponse<MaterialCategoryPick>>('/material-store/categories/custom', { name }),
  registerMaterialCategory: (name: string) =>
    api.post<ApiResponse<MaterialCategoryPick[]>>('/material-store/categories/register', { name }),
  listStoreCategories: () => api.get<ApiResponse<StoreMaterialCategory[]>>('/material-store/store-categories'),
  saveStoreCategory: (body: { name: string; description?: string; image?: string; status?: 'ACTIVE' | 'INACTIVE' }, id?: string) =>
    id
      ? api.patch<ApiResponse<StoreMaterialCategory>>(`/material-store/store-categories/${id}`, body)
      : api.post<ApiResponse<StoreMaterialCategory>>('/material-store/store-categories', body),
  deleteStoreCategory: (id: string) => api.delete<ApiResponse<{ deleted: boolean; id: string }>>(`/material-store/store-categories/${id}`),
  listMaterials: () => api.get<ApiResponse<CatalogMaterial[]>>('/material-store/materials'),
  saveMaterial: (body: Partial<CatalogMaterial>, id?: string) =>
    id
      ? api.patch<ApiResponse<CatalogMaterial>>(`/material-store/materials/${id}`, body)
      : api.post<ApiResponse<CatalogMaterial>>('/material-store/materials', body),
  deleteMaterial: (id: string) =>
    api.delete<ApiResponse<{ deleted: boolean; deactivated?: boolean; id: string }>>(`/material-store/materials/${id}`),
  getPublicProfile: () =>
    api.get<
      ApiResponse<{
        publicProfile: PublicStoreProfile;
        categories: MaterialCategoryPick[];
        materials: CatalogMaterial[];
        reviews: { average: number; count: number; items: PublicStoreReview[] };
        verified: {
          businessName: string;
          representativeName: string;
          contactEmail: string;
          contactPhone: string;
          taxCode: string;
          address: string;
          city: string;
          verificationStatus: string;
          submittedAt: string | null;
          reviewedAt: string | null;
        };
      }>
    >('/material-store/public-profile'),
  savePublicProfile: (body: Partial<PublicStoreProfile>) =>
    api.patch<ApiResponse<PublicStoreProfile>>('/material-store/public-profile', body),
  requestVerificationChange: (note: string) =>
    api.post<ApiResponse<{ requested: boolean }>>('/material-store/verification/change-request', { note }),
};
