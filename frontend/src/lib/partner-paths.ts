import { useAuthStore } from '@/store/auth.store';

export function contractorProfilePath(contractorId: string, role?: string | null) {
  const id = String(contractorId || '');
  return role === 'CUSTOMER' ? `/customer/contractors/${id}` : `/contractors/${id}`;
}

export function storeProfilePath(storeId: string, role?: string | null) {
  const id = String(storeId || '');
  return role === 'CUSTOMER' ? `/customer/stores/${id}` : `/stores/${id}`;
}

export function storeMaterialPath(storeId: string, materialId: string, role?: string | null) {
  return `${storeProfilePath(storeId, role)}/materials/${String(materialId || '')}`;
}

export function explorePath(role?: string | null) {
  return role === 'CUSTOMER' ? '/customer/explore' : '/explore';
}

export function explorePathFromLocation(pathname: string) {
  return pathname.startsWith('/customer/') ? '/customer/explore' : '/explore';
}

export function usePartnerPaths() {
  const role = useAuthStore((state) => state.user?.role);
  return {
    role,
    contractor: (id: string) => contractorProfilePath(id, role),
    store: (id: string) => storeProfilePath(id, role),
    material: (storeId: string, materialId: string) => storeMaterialPath(storeId, materialId, role),
    explore: explorePath(role),
  };
}
