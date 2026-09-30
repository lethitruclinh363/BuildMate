export type QuoteItemType = 'MATERIAL' | 'LABOR';

export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'MODIFICATION_REQUEST';

export interface QuotationItem {
  type: QuoteItemType;
  name: string;
  quantity: number;
  unit?: string;
  price: number;
  catalogId?: string | null;
}

export interface Quotation {
  id: string;
  requestId: string;
  customerId: string;
  contractorId: string;
  roomId?: string | null;
  items: QuotationItem[];
  materialCost: number;
  laborCost: number;
  transportCost: number;
  totalCost: number;
  estimatedDays: number;
  note?: string;
  modificationNote?: string;
  status: QuotationStatus;
  createdAt: string;
  updatedAt: string;
}
