import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { NearbyPlace, PublicMaterial, PublicService } from '@/types/marketplace';
import type { CatalogService, CatalogMaterial, Storefront, ContractorProfile } from '@/types/partner';

export const locationApi = {
  nearbyStores: (lat: number, lng: number, radius: number, extra?: Record<string, string | number | undefined>) =>
    api.get<ApiResponse<NearbyPlace[]>>('/location/stores/nearby', { params: { lat, lng, radius, ...extra } }),
  nearbyContractors: (lat: number, lng: number, radius: number, extra?: Record<string, string | number | undefined>) =>
    api.get<ApiResponse<NearbyPlace[]>>('/location/contractors/nearby', {
      params: { lat, lng, radius, ...extra },
    }),
  store: (id: string) =>
    api.get<ApiResponse<{ store: Storefront; services: CatalogService[]; materials: CatalogMaterial[]; profile: ContractorProfile | null }>>(
      `/stores/${id}`
    ),
  contractor: (id: string) =>
    api.get<
      ApiResponse<{
        contractor: ContractorProfile & {
          id: string;
          name: string;
          avatar: string;
          phone: string;
          certificates: { url: string; originalName: string; type: string }[];
          portfolio: { url: string; originalName: string; type: string }[];
          license: { url: string; originalName: string; type: string }[];
        };
        store: Storefront | null;
        services: CatalogService[];
      }>
    >(`/contractors/${id}`),
  searchServices: (params: { category?: string; keyword?: string }) =>
    api.get<ApiResponse<PublicService[]>>('/services/search', { params }),
  searchMaterials: (params: { category?: string; keyword?: string; store?: string }) =>
    api.get<ApiResponse<PublicMaterial[]>>('/materials/search', { params }),
};
