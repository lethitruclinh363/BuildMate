import { api } from '@/services/api';
import { cached, invalidateCache } from '@/lib/cache';
import type {
  AdminStats,
  AnalyticsPayload,
  AuditLog,
  CommissionRule,
  Complaint,
  ComplaintStatus,
  OrderDetail,
  OrderPaymentsPayload,
  CustomerAccount,
  AdminUserAccount,
  AdminUsersPayload,
  AdminUserDetail,
  CustomerDetail,
  PartnerApplication,
  ReviewListPayload,
  VerificationStatus,
} from '@/types/admin';
import type { ApiResponse, User } from '@/types/api';

export interface ServiceSuggestion {
  id: string;
  requesterName: string;
  teamName: string;
  description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | string;
  adminNote: string;
  createdAt: string;
}

export interface AdminCatalogService {
  id: string;
  name: string;
  category: string;
  description?: string;
  type?: string;
  status: string;
  proposerName?: string;
}

export interface AdminCatalogPayload {
  stats: { total: number; active: number; inactive: number; proposals: number };
  items: AdminCatalogService[];
  proposals: AdminCatalogService[];
}

export interface AdminMaterialCategory {
  id: string | null;
  name: string;
  labels?: { vi?: string; en?: string };
  group: string;
  type: 'SYSTEM' | 'CUSTOM';
  status: string;
  createdAt?: string | null;
  locked?: boolean;
  storeName?: string | null;
  ownerId?: string | null;
}

export interface AdminMaterialCatalog {
  system: AdminMaterialCategory[];
  custom: AdminMaterialCategory[];
}

export interface AdminCatalogWrite {
  name: string;
  category: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  acknowledgeSimilar?: boolean;
}

export interface AdminFinanceLedger {
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
}

export interface AdminEscrowRow {
  orderId: string;
  orderCode: string | null;
  customerId: string;
  contractorId: string;
  workStatus: string | null;
  accepted: boolean;
  paymentId: string;
  paymentStatus: string;
  paymentType: string;
  quoteTotal: number;
  depositAmount: number;
  platformFee: number;
  contractorHold: number;
  remainingAmount: number;
  remainingSettled: boolean;
  escrowStatus: string;
  payoutStatus: string;
  refundedAmount: number;
  releasedAmount: number;
  cancelCase?: string | null;
  cancelReason?: string | null;
  openComplaint: boolean;
  mock: boolean;
  actions: { canPayout: boolean; canRefund: boolean; payoutBlock: string | null; refundBlock: string | null };
}

function unwrap<T>(payload: ApiResponse<T>) {
  return payload.data;
}

function bustCache<T>(value: T): T {
  invalidateCache();
  return value;
}

export const adminApi = {
  stats: () => cached('admin-stats', 60_000, async () => unwrap((await api.get<ApiResponse<AdminStats>>('/admin/stats')).data)),

  analytics: () =>
    cached('admin-analytics', 60_000, async () => unwrap((await api.get<ApiResponse<AnalyticsPayload>>('/admin/analytics')).data)),


  listUsers: async (params?: { page?: number; limit?: number; role?: string; status?: string; keyword?: string }) =>
    unwrap((await api.get<ApiResponse<AdminUsersPayload>>('/admin/users', { params })).data),

  getUser: async (id: string) =>
    unwrap((await api.get<ApiResponse<AdminUserDetail>>(`/admin/users/${id}`)).data),

  lockUser: async (id: string, reason?: string) =>
    bustCache(unwrap((await api.post<ApiResponse<{ success: boolean; message: string; user: AdminUserAccount }>>(`/admin/users/${id}/lock`, { reason })).data)),

  unlockUser: async (id: string, reason?: string) =>
    bustCache(unwrap((await api.post<ApiResponse<{ success: boolean; message: string; user: AdminUserAccount }>>(`/admin/users/${id}/unlock`, { reason })).data)),

  listCustomers: () =>
    cached('admin-customers', 60_000, async () =>
      unwrap((await api.get<ApiResponse<CustomerAccount[]>>('/admin/customers')).data)
    ),

  getCustomer: async (id: string) => unwrap((await api.get<ApiResponse<CustomerDetail>>(`/admin/customers/${id}`)).data),

  listVerifications: (status?: VerificationStatus | '') =>
    cached(`admin-verifications:${status || 'all'}`, 60_000, async () =>
      unwrap(
        (
          await api.get<ApiResponse<PartnerApplication[]>>('/admin/verifications', {
            params: status ? { status } : undefined,
          })
        ).data
      )
    ),

  getVerification: async (id: string) =>
    unwrap((await api.get<ApiResponse<PartnerApplication>>(`/admin/verifications/${id}`)).data),

  approve: async (id: string) =>
    bustCache(unwrap((await api.post<ApiResponse<PartnerApplication>>(`/admin/verifications/${id}/approve`)).data)),

  reject: async (id: string, reason: string) =>
    bustCache(
      unwrap((await api.post<ApiResponse<PartnerApplication>>(`/admin/verifications/${id}/reject`, { reason })).data)
    ),

  retakeEkyc: async (id: string, reason: string) =>
    bustCache(
      unwrap((await api.post<ApiResponse<PartnerApplication['ekyc']>>(`/admin/verifications/${id}/ekyc/retake`, { reason })).data)
    ),

  ekycFile: async (id: string, kind: string) => {
    const response = await api.get<Blob>(`/admin/verifications/${id}/ekyc/files/${kind}`, { responseType: 'blob' });
    return URL.createObjectURL(response.data);
  },

  verificationFile: async (id: string, documentId: string) => {
    const response = await api.get<Blob>(`/admin/verifications/${id}/documents/${documentId}/file`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },

  reviewCatalogService: async (id: string, decision: 'approve' | 'reject') =>
    bustCache(unwrap((await api.post<ApiResponse<{ id: string; status: string }>>(`/admin/service-catalog/${id}/review`, { decision })).data)),

  listCatalog: async (params?: { q?: string; category?: string; status?: string }) =>
    unwrap((await api.get<ApiResponse<AdminCatalogPayload>>('/admin/service-catalog', { params })).data),

  createCatalog: async (body: AdminCatalogWrite) =>
    bustCache(unwrap((await api.post<ApiResponse<AdminCatalogService>>('/admin/service-catalog', body)).data)),

  updateCatalog: async (id: string, body: AdminCatalogWrite) =>
    bustCache(unwrap((await api.patch<ApiResponse<AdminCatalogService>>(`/admin/service-catalog/${id}`, body)).data)),

  setCatalogStatus: async (id: string, status: 'ACTIVE' | 'INACTIVE') =>
    bustCache(unwrap((await api.patch<ApiResponse<AdminCatalogService>>(`/admin/service-catalog/${id}/status`, { status })).data)),

  listServiceSuggestions: async () =>
    unwrap((await api.get<ApiResponse<ServiceSuggestion[]>>('/service-suggestions')).data),

  rejectServiceSuggestion: async (id: string, adminNote: string) =>
    unwrap((await api.post<ApiResponse<ServiceSuggestion>>(`/service-suggestions/${id}/reject`, { adminNote })).data),

  convertServiceSuggestion: async (id: string, body: AdminCatalogWrite) =>
    bustCache(unwrap((await api.post<ApiResponse<{ suggestion: ServiceSuggestion; service: AdminCatalogService }>>(`/service-suggestions/${id}/convert`, body)).data)),

  listMaterialCategories: async () => unwrap((await api.get<ApiResponse<AdminMaterialCatalog>>('/admin/material-categories')).data),

  createMaterialCategory: async (name: string) =>
    bustCache(unwrap((await api.post<ApiResponse<AdminMaterialCategory>>('/admin/material-categories', { name })).data)),

  updateMaterialCategory: async (id: string, name: string) =>
    bustCache(unwrap((await api.patch<ApiResponse<AdminMaterialCategory>>(`/admin/material-categories/${id}`, { name })).data)),

  reviewMaterialCategory: async (id: string, decision: 'approve' | 'reject', reason?: string) =>
    bustCache(unwrap((await api.post<ApiResponse<AdminMaterialCategory>>(`/admin/material-categories/${id}/review`, { decision, reason })).data)),

  auditLogs: (params?: { action?: string; limit?: number }) =>
    cached(`admin-audit:${JSON.stringify(params || {})}`, 60_000, async () =>
      unwrap((await api.get<ApiResponse<AuditLog[]>>('/admin/audit-logs', { params })).data)
    ),

  getCommissionRule: async () =>
    unwrap((await api.get<ApiResponse<CommissionRule>>('/admin/settings/commission')).data),

  setCommissionRule: async (body: { percentage: number; name?: string }) =>
    bustCache(unwrap((await api.patch<ApiResponse<CommissionRule>>('/admin/settings/commission', body)).data)),

  listComplaints: (status?: ComplaintStatus | '') =>
    cached(`admin-complaints:${status || 'all'}`, 60_000, async () =>
      unwrap(
        (
          await api.get<ApiResponse<Complaint[]>>('/admin/complaints', {
            params: status ? { status } : undefined,
          })
        ).data
      )
    ),

  patchComplaint: async (id: string, body: { status: ComplaintStatus; adminNote?: string }) =>
    bustCache(unwrap((await api.patch<ApiResponse<Complaint>>(`/admin/complaints/${id}`, body)).data)),

  refundPayment: async (id: string, reason?: string) =>
    bustCache(
      unwrap((await api.post<ApiResponse<{ id: string; status: string }>>(`/admin/payments/${id}/refund`, { reason })).data)
    ),

  financeSummary: async () => unwrap((await api.get<ApiResponse<AdminFinanceLedger>>('/admin/finance/summary')).data),

  listEscrows: async () => unwrap((await api.get<ApiResponse<AdminEscrowRow[]>>('/admin/finance/escrow')).data),

  settleEscrow: async (orderId: string) =>
    bustCache(unwrap((await api.post<ApiResponse<{ mock: boolean }>>(`/admin/orders/${orderId}/escrow/settle`)).data)),

  refundEscrow: async (orderId: string, reason?: string) =>
    bustCache(
      unwrap((await api.post<ApiResponse<{ mock: boolean }>>(`/admin/orders/${orderId}/escrow/refund`, { reason })).data)
    ),

  listRepairOrders: () =>
    cached('admin-repair-orders', 60_000, async () =>
      unwrap((await api.get<ApiResponse<OrderDetail[]>>('/admin/orders')).data)
    ),

  getOrder: async (id: string) => unwrap((await api.get<ApiResponse<OrderDetail>>(`/orders/${id}`)).data),

  getOrderPayments: async (orderId: string) =>
    unwrap((await api.get<ApiResponse<OrderPaymentsPayload>>(`/payments/order/${orderId}`)).data),

  getReviewsForUser: async (userId: string, targetType?: 'CONTRACTOR' | 'MATERIAL_STORE') =>
    unwrap(
      (
        await api.get<ApiResponse<ReviewListPayload>>(`/reviews/user/${userId}`, {
          params: targetType ? { targetType } : undefined,
        })
      ).data
    ),

  getProfile: async () => unwrap((await api.get<ApiResponse<User>>('/admin/auth/me')).data),

  health: () =>
    cached('admin-health', 30_000, async () =>
      unwrap((await api.get<ApiResponse<{ service: string; time: string }>>('/health')).data)
    ),

  listNotifications: () =>
    cached('admin-notifications', 30_000, async () =>
      unwrap(
        (
          await api.get<
            ApiResponse<{
              items: Array<{
                id: string;
                title: string;
                message: string;
                type: string;
                isRead: boolean;
                createdAt: string;
                link?: string;
              }>;
              unread: number;
            }>
          >('/notifications')
        ).data
      )
    ),

  markNotificationsRead: async () =>
    bustCache(unwrap((await api.patch<ApiResponse<{ unread: number }>>('/notifications/read-all')).data)),

  markNotificationRead: async (id: string) => {
    const data = unwrap((await api.patch<ApiResponse<unknown>>(`/notifications/${id}/read`)).data);
    invalidateCache('admin-notifications');
    return data;
  },

  logout: async () => {
    await api.post('/admin/auth/logout');
  },
};
