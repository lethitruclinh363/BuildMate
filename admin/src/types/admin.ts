export type VerificationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type DocumentType = 'BUSINESS_LICENSE' | 'CERTIFICATE' | 'CCCD_FRONT' | 'CCCD_BACK' | 'ID_CARD' | 'STORE_IMAGE' | 'PORTFOLIO';
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
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locationConfirmed?: boolean;
  locationConfirmedAt?: string | null;
  locationApprovedAt?: string | null;
  locationSource?: string | null;
  providerRefId?: string | null;
  location?: { type?: string; coordinates?: number[] } | null;
  description: string;
  yearsExperience: number;
  serviceAreas: string[];
  materialCategories?: {
    name: string;
    type?: 'SYSTEM' | 'CUSTOM';
    categoryId?: string | null;
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'ACTIVE';
    createdAt?: string | null;
  }[];
  services?: {
    category: string;
    name: string;
    type?: 'SYSTEM' | 'CUSTOM';
    serviceId?: string | null;
    status?: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'ACTIVE';
    completionStatus?: 'INCOMPLETE' | 'COMPLETED' | null;
  }[];
  portfolio?: {
    avatar: string;
    teamLogo: string;
    workshop: string;
    construction: string[];
    certificates: string[];
    projects?: {
      id: string;
      serviceId: string;
      serviceNameSnapshot: string;
      description: string;
      images: string[];
    }[];
  };
  verificationStatus: VerificationStatus;
  documents: VerificationDocument[];
  rejectionReason: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: PartnerUser | null;
  ekyc?: {
    referenceCode?: string;
    status?: string;
    retakeReason?: string;
    ocr?: {
      idNumber?: string;
      fullName?: string;
      dateOfBirth?: string;
      gender?: string;
      hometown?: string;
      passed?: boolean;
    };
    liveness?: { passed?: boolean };
    faceMatch?: {
      decision?: string;
      matched?: boolean;
      distance?: number | null;
      threshold?: number | null;
    } | null;
  } | null;
  activation?: {
    activationStatus: 'INACTIVE' | 'LIVE' | 'PAUSED';
    percent: number;
    verificationStatus: string;
    visible: boolean;
  } | null;
  publicProfile?: {
    displayName?: string;
    description?: string;
    phone?: string;
    city?: string;
    address?: string;
    openingHours?: string;
    serviceAreas?: string[];
    showroomNote?: string;
    deliveryNote?: string;
    profileType?: 'STORE' | 'CONTRACTOR';
    verified?: boolean;
  } | null;
}

export interface AdminStats {
  pending: number;
  approved: number;
  rejected: number;
  draft: number;
}

export interface AnalyticsSeriesPoint {
  key: string;
  label: string;
  created?: number;
  completed?: number;
  gmv?: number;
  payment?: number;
  commission?: number;
  earning?: number;
  customer?: number;
  contractor?: number;
}

export interface AnalyticsPayload {
  users: {
    total: number;
    customer: number;
    contractor: number;
    admin: number;
    storeOwner?: number;
    liveContractor?: number;
    liveStore?: number;
  };
  orders: {
    total: number;
    completed: number;
    cancelled: number;
    inProgress?: number;
    materialTotal?: number;
    materialCompleted?: number;
    byStatus?: Record<string, number>;
  };
  finance: {
    revenue: number;
    gmv?: number;
    paidCount: number;
    commission: number;
    contractorEarning: number;
    capturedDeposits?: number;
    materialGmv?: number;
    materialCompleted?: number;
    materialPlatformRevenue?: number;
    ledger?: {
      acceptedQuoteTotal: number;
      capturedDeposit: number;
      heldAmount: number;
      disputedAmount: number;
      refundPendingAmount: number;
      refundedAmount: number;
      payoutPendingAmount: number;
      paidOutAmount: number;
      platformFeePosted: number;
      materialGmv: number;
      mock?: boolean;
    };
  };
  reviews: { total: number; average: number };
  complaints: { total: number; open: number; processing: number; resolved: number; rejected: number };
  series?: {
    days7: AnalyticsSeriesPoint[];
    days30: AnalyticsSeriesPoint[];
    months12: AnalyticsSeriesPoint[];
    deltas?: {
      users: number;
      contractors: number;
      orders: number;
      gmv: number;
      commission: number;
    };
  };
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

export type MaterialOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_CONFIRMATION'
  | 'DEPOSIT_PAID'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERING'
  | 'DELIVERED'
  | 'CUSTOMER_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MaterialOrderItem {
  materialId: string;
  nameSnapshot: string;
  imageSnapshot: string;
  unitSnapshot: string;
  priceSnapshot: number;
  quantity: number;
  lineTotal: number;
}

export interface MaterialOrder {
  id: string;
  orderCode: string;
  customerId: string;
  storeId: string;
  storeOwnerId: string;
  items: MaterialOrderItem[];
  deliveryAddress: string;
  deliveryLocation: { type: string; coordinates: number[] } | null;
  distanceKm: number;
  materialSubtotal: number;
  shippingFee: number;
  totalAmount: number;
  depositRateSnapshot: number;
  depositAmount: number;
  platformFeeRateSnapshot: number;
  platformFeeAmount: number;
  storeDepositAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  status: MaterialOrderStatus;
  statusHistory: Array<{
    status: string;
    actorId: string | null;
    actorRole: string;
    note: string;
    createdAt: string;
  }>;
  customerNote: string;
  remainingSettledOffline: boolean;
  remainingSettledAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string };
  storeName?: string;
}

export interface AdminMaterialOrderPayload {
  items: MaterialOrder[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  stats: {
    orderCount: number;
    processingCount: number;
    deliveringCount: number;
    completedCount: number;
    cancelledCount: number;
    orderValue: number;
    collectedAmount: number;
    uncollectedAmount: number;
  };
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
    escrowStatus?: string | null;
    depositAmount?: number | null;
    platformFee?: number | null;
    contractorHold?: number | null;
  };
  items: Payment[];
}

export interface OrderDetail extends Order {
  payment: Payment | null;
  assignments: [];
  isMaterialOrder?: boolean;
  storeName?: string;
  customerName?: string;
  deliveryAddress?: string;
  statusHistory?: Array<{ status: string; actorRole?: string; createdAt?: string; note?: string }>;
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

export interface AdminUserAccount {
  id: string;
  numericId?: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  phoneNumber?: string;
  role: 'CUSTOMER' | 'CONTRACTOR' | 'MATERIAL_STORE_OWNER' | 'ADMIN' | string;
  status: 'ACTIVE' | 'BLOCKED' | 'PENDING_EMAIL' | 'PENDING_APPROVAL' | 'REJECTED' | 'INACTIVE' | string;
  accountStatus: string;
  avatar: string;
  emailVerified: boolean;
  tokenVersion?: number;
  createdAt: string;
  updatedAt: string;
  partnerStatus?: {
    businessName?: string;
    verificationStatus?: string;
    isLive?: boolean;
    isActive?: boolean;
    city?: string;
  };
  storeStatus?: {
    storeName?: string;
    isActive?: boolean;
    storeType?: string;
    city?: string;
  };
}

export interface AdminUsersPayload {
  items: AdminUserAccount[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    total: number;
    active: number;
    blocked: number;
    pending: number;
  };
}

export interface AdminUserDetail {
  user: AdminUserAccount;
  partnerProfile?: any;
  store?: any;
  counts: {
    repairOrders: number;
    materialOrders: number;
    complaints: number;
  };
  auditHistory: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    meta: Record<string, any>;
    ip: string;
    createdAt: string;
    actor?: { id: string; name: string; email: string; role: string } | null;
  }>;
}
