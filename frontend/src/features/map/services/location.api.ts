import { api } from '@/lib/api';
import type { ApiResponse } from '@/types/user';
import type { NearbyPlace, PublicContractorProfile, PublicHighlights, PublicMaterial, PublicService, PublicStoreProfile, PublicStoreReview } from '@/types/marketplace';
import type { MaterialCategoryPick } from '@/data/material-categories';
import type { CatalogService, CatalogMaterial, Storefront } from '@/types/partner';

export interface MaterialSearchParams {
  category?: string;
  categoryId?: string;
  keyword?: string;
  store?: string;
  minPrice?: number;
  maxPrice?: number;
  sellingStatus?: 'all' | 'selling' | 'out' | 'paused' | 'discontinued';
  sortBy?: 'default' | 'price_asc' | 'price_desc' | 'newest';
  page?: number;
  limit?: number;
}

export interface MaterialCategoryItem {
  id: string | null;
  name: string;
  type: 'SYSTEM' | 'CUSTOM';
  labelVi: string;
  labelEn: string;
}

export interface MaterialSearchResult {
  items: PublicMaterial[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
//API Search Contractors by Location & Search Material Stores by Location
export const locationApi = {
  nearbyStores: (lat: number, lng: number, radius: number, extra?: Record<string, string | number | undefined>) =>
    api.get<ApiResponse<NearbyPlace[]>>('/location/stores/nearby', { params: { lat, lng, radius, ...extra } }),
  nearbyContractors: (lat: number, lng: number, radius: number, extra?: Record<string, string | number | undefined>) =>
    api.get<ApiResponse<NearbyPlace[]>>('/location/contractors/nearby', {
      params: { lat, lng, radius, ...extra },
    }),
  store: (id: string) =>
    api.get<ApiResponse<{
      store: Storefront;
      publicProfile: PublicStoreProfile | PublicContractorProfile | null;
      categories?: MaterialCategoryPick[];
      reviews?: { average: number; count: number; items: PublicStoreReview[] } | null;
      services: CatalogService[];
      materials: CatalogMaterial[];
    }>>(
      `/stores/${id}`
    ),
  contractor: (id: string) =>
    api.get<
      ApiResponse<{
        publicProfile: PublicContractorProfile | null;
        highlights?: PublicHighlights;
        contractor: { id: string; userId: string; businessName: string; name: string } | null;
        store: Storefront | null;
        services: CatalogService[];
      }>
    >(`/contractors/${id}`),
  searchServices: (params: { category?: string; keyword?: string }) =>
    api.get<ApiResponse<PublicService[]>>('/services/search', { params }),
  materialCategories: () =>
    api.get<ApiResponse<MaterialCategoryItem[]>>('/materials/categories'),
  searchMaterials: (params: MaterialSearchParams) =>
    api.get<ApiResponse<PublicMaterial[] | MaterialSearchResult>>('/materials/search', { params }),
};
