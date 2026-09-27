export type VerificationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type DocumentType = 'BUSINESS_LICENSE' | 'CERTIFICATE' | 'ID_CARD' | 'STORE_IMAGE' | 'PORTFOLIO';
export type ComplaintStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'REJECTED';
export type OrderStatus =
  | 'REQUEST_CREATED'
  | 'QUOTATION_SENT'
  | 'QUOTATION_ACCEPTED'
  | 'DEPOSIT_PAID'
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CUSTOMER_ACCEPTED'
  | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface VerificationDocument {
  _id: string;
  type: DocumentType;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface PartnerUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  status: string;
  role?: string;
}

export interface PartnerApplication {
  id: string;
  userId: string;
  businessName: string;
  taxCode: string;
  address: string;
  city: string;
  description: string;
  yearsExperience: number;
  serviceAreas: string[];
  verificationStatus: VerificationStatus;
  documents: VerificationDocument[];
  rejectionReason: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: PartnerUser | null;
}

export interface AdminStats {
  pending: number;
  approved: number;
  rejected: number;
  draft: number;
}

export interface AnalyticsPayload {
  users: { total: number; customer: number; contractor: number; admin: number };
  orders: { total: number; completed: number; cancelled: number };
  finance: { revenue: number; paidCount: number; commission: number; contractorEarning: number };
  reviews: { total: number; average: number };
  complaints: { total: number; open: number; processing: number; resolved: number; rejected: number };
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: Record<string, unknown>;
  ip: string;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
}

export interface CommissionRule {
  id: string;
  name: string;
  percentage: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Complaint {
  id: string;
  orderId: string;
  createdBy: string;
  againstUser: string;
  reason: string;
  description: string;
  attachments: string[];
  status: ComplaintStatus;
  adminNote: string;
  adminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderCode: string;
  quotationId: string;
  requestId: string;
  customerId: string;
  contractorId: string;
  storeId: string | null;
  title: string;
  description: string;
  amount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelReason?: string;
  cancelledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  customerId: string;
  contractorId: string;
  amount: number;
  type: string;
  status: PaymentStatus;
  provider: string;
  transactionCode: string | null;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPaymentsPayload {
  summary: {
    status: PaymentStatus;
    amount: number;
    paidAmount: number;
    remainingAmount: number;
    due?: number;
  };
  items: Payment[];
}

export interface OrderDetail extends Order {
  payment: Payment | null;
  assignments: [];
}

export interface Review {
  id: string;
  orderId: string;
  customerId: string;
  targetUserId: string;
  targetType: 'CONTRACTOR' | 'MATERIAL_STORE';
  rating: number;
  comment: string;
  images: string[];
  createdAt: string;
}

export interface ReviewListPayload {
  average: number;
  count: number;
  items: Review[];
}

export interface CustomerAccount {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  phone: string;
  avatar?: string;
  role: 'CUSTOMER';
  status: string;
  city: string;
  createdAt: string;
}

export interface CustomerDetail {
  user: CustomerAccount;
  orders: Order[];
  reviews: Review[];
  complaints: Complaint[];
}

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: string;
  status: string;
  source: 'verification' | 'complaint' | 'order';
}
