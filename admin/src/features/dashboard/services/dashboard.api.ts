import { loadAdminDirectory, type AdminDirectory } from '@/hooks/useDirectory';
import { adminApi } from '@/services/admin.api';
import { cached } from '@/lib/cache';
import { vnd } from '@/lib/utils';
import { dayLabels, monthLabels } from '@/features/dashboard/lib/format';
import type {
  ActivityItem,
  AdminNotification,
  DashboardOverview,
  HealthStatus,
  Point,
  SearchHit,
  StatusSlice,
  TopContractorRow,
} from '@/features/dashboard/types/dashboard.types';

function socketOrigin() {
  return (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace(/\/api\/v1\/?$/, '');
}

async function probeHealth(socketLive: boolean): Promise<HealthStatus> {
  const checkedAt = new Date().toISOString();
  try {
    await adminApi.health();
    return {
      backend: 'ONLINE',
      database: 'CONNECTED',
      socket: socketLive ? 'ACTIVE' : 'STANDBY',
      storage: 'AVAILABLE',
      checkedAt,
    };
  } catch {
    return {
      backend: 'OFFLINE',
      database: 'DOWN',
      socket: socketLive ? 'ACTIVE' : 'STANDBY',
      storage: 'UNAVAILABLE',
      checkedAt,
    };
  }
}

function mapActivity(directory: AdminDirectory): ActivityItem[] {
  return directory.audit.slice(0, 14).map((row) => {
    const action = row.action;
    let tone: ActivityItem['tone'] = 'info';
    let title = action.replaceAll('_', ' ');
    if (action.includes('PAYMENT')) {
      tone = 'money';
      title = 'dash.actPayment';
    } else if (action.includes('REVIEW')) {
      tone = 'star';
      title = 'dash.actReview';
    } else if (action.includes('COMPLAINT')) {
      tone = 'warn';
      title = 'dash.actComplaint';
    } else if (action.includes('APPROVE') || action.includes('ORDER_CREATED')) {
      tone = 'success';
      title = action === 'ORDER_CREATED' ? 'dash.actOrder' : 'dash.actApproved';
    }
    const orderMeta = typeof row.meta?.orderId === 'string' ? row.meta.orderId : row.entityId;
    return {
      id: row.id,
      tone,
      title,
      body: row.actor?.name || row.actorRole || orderMeta || row.entityType,
      at: row.createdAt,
    };
  });
}

function topContractors(directory: AdminDirectory): TopContractorRow[] {
  const approved = directory.verifications.filter(
    (row) => row.verificationStatus === 'APPROVED' && row.user?.role === 'CONTRACTOR'
  );
  return approved
    .map((row, index) => {
      const id = String(row.user?.id || row.userId);
      const related = directory.orders.filter((order) => order.contractorId === id);
      const revenue = related.reduce((sum, order) => sum + (order.amount || 0), 0);
      const review = directory.reviews.filter((item) => item.targetUserId === id && item.targetType === 'CONTRACTOR');
      const rating =
        review.length > 0 ? review.reduce((sum, item) => sum + item.rating, 0) / review.length : 0;
      return {
        rank: index + 1,
        id,
        name: row.businessName || row.user?.name || '',
        avatar: row.user?.avatar || '',
        orders: related.length,
        rating: Math.round(rating * 10) / 10,
        revenue,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function searchIndex(
  directory: AdminDirectory,
  customerAccounts: Array<{ id: string; name: string; email: string }> = []
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const user of customerAccounts) {
    hits.push({
      id: user.id,
      kind: 'user',
      title: user.name,
      subtitle: user.email,
      to: `/users/${user.id}`,
    });
  }
  for (const row of directory.verifications) {
    const role = row.user?.role;
    if (role !== 'CONTRACTOR' && role !== 'MATERIAL_STORE_OWNER') continue;
    const id = String(row.user?.id || row.userId || row.id);
    hits.push({
      id,
      kind: 'contractor',
      title: row.businessName || row.user?.name || '',
      subtitle: row.user?.email || role,
      to: role === 'MATERIAL_STORE_OWNER' ? '/material-stores' : '/contractors',
    });
  }
  for (const order of directory.orders) {
    hits.push({
      id: order.id,
      kind: 'order',
      title: order.orderCode,
      subtitle: `${order.title} · ${vnd(order.amount)}`,
      to: `/orders/${order.id}`,
    });
  }
  for (const pay of directory.payments) {
    hits.push({
      id: pay.id,
      kind: 'payment',
      title: vnd(pay.amount),
      subtitle: `${pay.status} · ${pay.type}`,
      to: `/orders/${pay.orderId}`,
    });
  }
  return hits;
}

function buildOverview(
  directory: AdminDirectory,
  health: HealthStatus,
  inbox: { items: AdminNotification[]; unread: number },
  customerAccounts: Array<{ id: string; name: string; email: string }> = []
): DashboardOverview {
  const { analytics, stats } = directory;
  const zeros = (labels: string[], extra: Partial<Point> = {}): Point[] =>
    labels.map((label) => ({ label, created: 0, completed: 0, ...extra }));
  const series = analytics.series;
  const orderTrend = {
    '7d': series?.days7?.length
      ? series.days7.map((row) => ({
          label: row.label,
          created: Number.isFinite(row.created) ? Number(row.created) : 0,
          completed: Number.isFinite(row.completed) ? Number(row.completed) : 0,
        }))
      : zeros(dayLabels(7)),
    '30d': series?.days30?.length
      ? series.days30.map((row) => ({
          label: row.label,
          created: Number.isFinite(row.created) ? Number(row.created) : 0,
          completed: Number.isFinite(row.completed) ? Number(row.completed) : 0,
        }))
      : zeros(dayLabels(30)),
    '12m': series?.months12?.length
      ? series.months12.map((row) => ({
          label: row.label,
          created: Number.isFinite(row.created) ? Number(row.created) : 0,
          completed: Number.isFinite(row.completed) ? Number(row.completed) : 0,
        }))
      : zeros(monthLabels()),
  };
  const revenue = series?.months12?.length
    ? series.months12.map((row) => ({
        label: row.label,
        payment: Number.isFinite(row.payment) ? Number(row.payment) : 0,
        commission: Number.isFinite(row.commission) ? Number(row.commission) : 0,
        earning: Number.isFinite(row.earning) ? Number(row.earning) : 0,
      }))
    : zeros(monthLabels(), { payment: 0, commission: 0, earning: 0 });
  const growth = series?.months12?.length
    ? series.months12.map((row) => ({
        label: row.label,
        customer: Number.isFinite(row.customer) ? Number(row.customer) : 0,
        contractor: Number.isFinite(row.contractor) ? Number(row.contractor) : 0,
      }))
    : zeros(monthLabels(), { customer: 0, contractor: 0 });

  const byStatus = analytics.orders.byStatus || {};
  const statusMix: StatusSlice[] = [
    { name: 'orderStatus.QUOTATION_ACCEPTED', value: byStatus.QUOTATION_ACCEPTED || 0, fill: '#60a5fa' },
    { name: 'orderStatus.DEPOSIT_PAID', value: byStatus.DEPOSIT_PAID || 0, fill: '#c89445' },
    { name: 'orderStatus.IN_PROGRESS', value: (byStatus.STARTED || 0) + (byStatus.IN_PROGRESS || 0), fill: '#f59e0b' },
    { name: 'orderStatus.COMPLETED', value: byStatus.COMPLETED || 0, fill: '#fbbf24' },
    { name: 'orderStatus.CUSTOMER_ACCEPTED', value: analytics.orders.completed, fill: '#34d399' },
    { name: 'orderStatus.CANCELLED', value: analytics.orders.cancelled, fill: '#f87171' },
  ].filter((row) => row.value > 0);

  const nameById = new Map(directory.users.map((u) => [u.id, u.name]));
  const contractorName = new Map(
    directory.verifications.map((row) => [String(row.user?.id || row.userId), row.businessName || row.user?.name || 'Contractor'])
  );

  const deltas = series?.deltas || { users: 0, contractors: 0, orders: 0, gmv: 0, commission: 0 };

  return {
    kpis: [
      {
        key: 'users',
        label: 'dash.kpiUsers',
        value: analytics.users.total,
        format: 'number',
        delta: deltas.users,
        hint: 'dash.hintPrior',
        href: '/users',
      },
      {
        key: 'contractors',
        label: 'dash.kpiContractors',
        value: analytics.users.liveContractor ?? analytics.users.contractor,
        format: 'number',
        delta: deltas.contractors,
        hint: 'dash.hintVerify',
        hintCount: stats.pending,
        href: '/contractors',
      },
      {
        key: 'orders',
        label: 'dash.kpiOrders',
        value: analytics.orders.total,
        format: 'number',
        delta: deltas.orders,
        hint: 'dash.hintCompleted',
        hintCount: analytics.orders.completed,
        href: '/orders',
      },
      {
        key: 'gmv',
        label: 'dash.kpiGmv',
        value: analytics.finance.gmv ?? 0,
        format: 'compact',
        delta: deltas.gmv,
        hint: 'dash.hintGmv',
        hintCount: (analytics.orders.completed || 0) + (analytics.orders.materialCompleted || 0),
        href: '/analytics',
      },
      {
        key: 'commission',
        label: 'dash.kpiCommission',
        value: analytics.finance.commission,
        format: 'compact',
        delta: deltas.commission,
        hint: 'dash.hintTake',
        tone: 'success',
        href: '/commission',
      },
      {
        key: 'complaints',
        label: 'dash.kpiComplaints',
        value: analytics.complaints.open,
        format: 'number',
        delta: 0,
        hint: 'dash.hintOpen',
        hintCount: analytics.complaints.open,
        tone: analytics.complaints.open ? 'danger' : 'success',
        href: '/complaints',
      },
    ],
    orderTrend,
    revenue,
    growth,
    statusMix,
    activity: mapActivity(directory),
    health,
    topContractors: topContractors(directory),
    recentOrders: [...directory.orders]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 8)
      .map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        title: order.title,
        customerId: order.customerId,
        contractorId: order.contractorId,
        customer: nameById.get(order.customerId) || order.customerId.slice(-6),
        contractor: contractorName.get(order.contractorId) || order.contractorId.slice(-6),
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt,
      })),
    searchIndex: searchIndex(directory, customerAccounts),
    notifications: inbox.items,
    unread: inbox.unread,
    refreshedAt: Date.now(),
  };
}

export async function loadDashboardOverview(socketLive = false): Promise<DashboardOverview> {
  return cached('admin-dashboard', 60_000, async () => {
    const [directory, inbox, customerAccounts] = await Promise.all([
      loadAdminDirectory(),
      adminApi.listNotifications().catch(() => ({ items: [], unread: 0 })),
      adminApi.listCustomers().catch(() => []),
    ]);
    const health = await probeHealth(socketLive);
    return buildOverview(directory, health, inbox, customerAccounts);
  });
}

export { socketOrigin };
