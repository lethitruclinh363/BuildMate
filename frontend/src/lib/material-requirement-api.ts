import { api } from '@/lib/api';

export type MaterialRequirementItem = {
  id: string;
  name: string;
  specification?: string;
  unit?: string;
  quantity: number;
  notes?: string;
};

export type MaterialQuoteLine = {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  availableQty: number;
  note?: string;
};

export type MaterialQuote = {
  id: string;
  storeId: string;
  status: string;
  deliveryFee: number;
  note?: string;
  items: MaterialQuoteLine[];
};

export type MaterialRequirementList = {
  id: string;
  requestId: string;
  contractorId: string;
  storeId?: string;
  storeName?: string;
  status: string;
  note?: string;
  items: MaterialRequirementItem[];
  quotes: MaterialQuote[];
  createdAt?: string;
  updatedAt?: string;
};

export type EligibleStore = {
  storeId: string;
  name: string;
  city?: string;
  sampleMaterial?: string;
  samplePrice?: number;
};

export type CatalogMatch = {
  materialId: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  storeId: string;
  storeName: string;
  city?: string;
  image?: string;
};

type Envelope<T> = { data: T; message?: string };

export const materialRequirementApi = {
  create: (body: { requestId: string; note?: string; items?: Partial<MaterialRequirementItem>[] }) =>
    api.post<Envelope<MaterialRequirementList>>('/material-requirements', body),
  mine: (params?: { repairRequestId?: string }) =>
    api.get<Envelope<MaterialRequirementList[]>>('/material-requirements', {
      silent: true,
      params: params?.repairRequestId ? { repairRequestId: params.repairRequestId } : undefined,
    }),
  get: (id: string) => api.get<Envelope<MaterialRequirementList>>(`/material-requirements/${id}`, { silent: true }),
  addItem: (id: string, body: Partial<MaterialRequirementItem>) =>
    api.post<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/items`, body),
  updateItem: (id: string, itemId: string, body: Partial<MaterialRequirementItem>) =>
    api.patch<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/items/${itemId}`, body),
  removeItem: (id: string, itemId: string) =>
    api.delete<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/items/${itemId}`),
  send: (id: string, storeId: string) =>
    api.post<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/send`, { storeId }),
  cancel: (id: string) => api.post<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/cancel`, {}),
  catalog: (id: string) =>
    api.get<Envelope<CatalogMatch[]>>(`/material-requirements/${id}/catalog-matches`, { silent: true }),
  eligibleStores: (id: string) =>
    api.get<Envelope<EligibleStore[]>>(`/material-requirements/${id}/eligible-stores`, { silent: true }),
  quote: (id: string, body: { items: Array<{ itemId: string; unitPrice: number; availableQty: number; note?: string }>; deliveryFee?: number; note?: string }) =>
    api.post<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/quotes`, body),
  confirm: (id: string) => api.post<Envelope<MaterialRequirementList>>(`/material-requirements/${id}/confirm`, {}),
};
