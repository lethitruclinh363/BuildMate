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
  CustomerDetail,
  PartnerApplication,
  ReviewListPayload,
  VerificationStatus,
} from '@/types/admin';
import type { ApiResponse, User } from '@/types/api';

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

export interface AdminCatalogWrite {
  name: string;
  category: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  acknowledgeSimilar?: boolean;
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

  getOrder: async (id: string) => unwrap((await api.get<ApiResponse<OrderDetail>>(`/orders/${id}`)).data),

  getOrderPayments: async (orderId: string) =>
    unwrap((await api.get<ApiResponse<OrderPaymentsPayload>>(`/payments/order/${orderId}`)).data),

  getReviewsForUser: async (userId: string) =>
    unwrap((await api.get<ApiResponse<ReviewListPayload>>(`/reviews/user/${userId}`)).data),

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

  logout: async () => {
    await api.post('/admin/auth/logout');
  },
};
