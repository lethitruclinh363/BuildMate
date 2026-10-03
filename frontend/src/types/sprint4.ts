export const REPAIR_CATEGORIES = [
  { value: 'PLUMBING', label: 'Ống nước' },
  { value: 'ELECTRIC', label: 'Điện' },
  { value: 'PAINTING', label: 'Sơn nhà' },
  { value: 'WATERPROOF', label: 'Chống thấm' },
  { value: 'TILE', label: 'Ốp lát' },
] as const;

export type RepairCategory = (typeof REPAIR_CATEGORIES)[number]['value'];
export type RequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'QUOTATION' | 'LOCATION';
export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'MODIFICATION_REQUEST';
export type QuoteItemType = 'MATERIAL' | 'LABOR';

export interface RepairRequest {
  id: string;
  customerId: string;
  contractorId: string;
  storeId: string | null;
  category: RepairCategory;
  title: string;
  description: string;
  images: string[];
  videos: string[];
  address: string;
  location: { type: 'Point'; coordinates: [number, number] };
  status: RequestStatus;
  roomId?: string | null;
  customer?: { id: string; name: string; avatar: string; phone: string } | null;
  contractor?: { id: string; name: string; avatar: string; phone: string } | null;
  store?: {
    id: string;
    name: string;
    address: string;
    contractorId?: string;
    storeType?: 'SERVICES' | 'MATERIALS' | 'BOTH';
  } | null;
  createdAt: string;
  updatedAt: string;
}

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
  roomId: string | null;
  items: QuotationItem[];
  materialCost: number;
  laborCost: number;
  transportCost: number;
  totalCost: number;
  estimatedDays: number;
  note: string;
  modificationNote: string;
  status: QuotationStatus;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: MessageType;
  content: string;
  location?: { lat: number; lng: number; address: string; label: string } | null;
  quotationId: string | null;
  quotation?: Quotation | null;
  read: boolean;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  customerId: string;
  contractorId: string;
  requestId: string;
  lastMessage: string;
  lastMessageAt: string;
  otherUser?: { id: string; name: string; avatar: string } | null;
  customer?: { id: string; name: string; avatar: string; phone: string } | null;
  contractor?: { id: string; name: string; avatar: string; phone: string } | null;
  request?: RepairRequest | null;
  otherOnline?: boolean;
  customerOnline?: boolean;
  contractorOnline?: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string;
  createdAt: string;
}

export function repairCreatePath(contractorId: string, storeId?: string | null) {
  const q = new URLSearchParams({ contractorId });
  if (storeId) q.set('storeId', storeId);
  return `/customer/request/create?${q.toString()}`;
}

export function withAuthRedirect(path: string, role?: string | null) {
  if (!role) return `/login?next=${encodeURIComponent(path)}`;
  return path;
}
