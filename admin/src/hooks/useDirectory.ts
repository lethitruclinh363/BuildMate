import { adminApi } from '@/services/admin.api';
import { settleAll } from '@/lib/utils';
import { cached } from '@/lib/cache';
import type { AuditLog, Complaint, DirectoryUser, OrderDetail, PartnerApplication, Payment, Review } from '@/types/admin';

function asId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'id' in value) return String((value as { id: string }).id);
  if (typeof value === 'object' && value && '_id' in value) return String((value as { _id: string })._id);
  return String(value);
}

export async function loadAdminDirectory() {
  return cached('admin-directory', 60_000, fetchAdminDirectory);
}

async function fetchAdminDirectory() {
  const [verifications, complaints, audit, analytics, stats] = await Promise.all([
    adminApi.listVerifications(),
    adminApi.listComplaints(''),
    adminApi.auditLogs({ limit: 80 }),
    adminApi.analytics(),
    adminApi.stats(),
  ]);

  const users = composeUsers(verifications, complaints);
  const orderIds = collectOrderIds(complaints, audit);
  const orders = await settleAll(orderIds.slice(0, 8).map((id) => adminApi.getOrder(id)));
  const paymentBundles = await settleAll(orders.map((order) => adminApi.getOrderPayments(order.id)));
  const payments = paymentBundles.flatMap((bundle) => bundle.items);

  const contractorIds = [...new Set(verifications.map((row) => asId(row.user?.id || row.userId)).filter(Boolean))];
  const reviewLists = await settleAll(contractorIds.slice(0, 5).map((id) => adminApi.getReviewsForUser(id)));
  const reviews = reviewLists
    .flatMap((row) => row.items)
    .filter((row) => row.targetType === 'CONTRACTOR' || row.targetType === 'MATERIAL_STORE');

  return {
    verifications,
    complaints,
    audit,
    analytics,
    stats,
    users,
    orders,
    payments,
    reviews,
  };
}

export function composeUsers(verifications: PartnerApplication[], complaints: Complaint[]): DirectoryUser[] {
  const map = new Map<string, DirectoryUser>();

  for (const row of verifications) {
    const id = asId(row.user?.id || row.userId);
    if (!id) continue;
    map.set(id, {
      id,
      name: row.user?.name || row.businessName || 'Contractor',
      email: row.user?.email || '',
      phone: row.user?.phone || '',
      avatar: row.user?.avatar || '',
      role: row.user?.role || 'CONTRACTOR',
      status: row.user?.status || row.verificationStatus,
      source: 'verification',
    });
  }

  for (const row of complaints) {
    for (const id of [asId(row.createdBy), asId(row.againstUser)]) {
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        name: `User ${id.slice(-6)}`,
        email: '',
        phone: '',
        avatar: '',
        role: 'UNKNOWN',
        status: 'ACTIVE',
        source: 'complaint',
      });
    }
  }

  return [...map.values()];
}

export function collectOrderIds(complaints: Complaint[], audit: AuditLog[]) {
  const ids = new Set<string>();
  for (const row of complaints) {
    const id = asId(row.orderId);
    if (id) ids.add(id);
  }
  for (const row of audit) {
    if (row.entityType === 'Order' && row.entityId) ids.add(String(row.entityId));
    const metaOrder = row.meta?.orderId;
    if (typeof metaOrder === 'string' && metaOrder) ids.add(metaOrder);
  }
  return [...ids];
}

export type AdminDirectory = {
  verifications: PartnerApplication[];
  complaints: Complaint[];
  audit: AuditLog[];
  analytics: Awaited<ReturnType<typeof adminApi.analytics>>;
  stats: Awaited<ReturnType<typeof adminApi.stats>>;
  users: DirectoryUser[];
  orders: OrderDetail[];
  payments: Payment[];
  reviews: Review[];
};
