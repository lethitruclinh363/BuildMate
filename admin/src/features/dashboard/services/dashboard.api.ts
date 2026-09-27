import { loadAdminDirectory, type AdminDirectory } from '@/hooks/useDirectory';
import { adminApi } from '@/services/admin.api';
import { cached } from '@/lib/cache';
import { vnd } from '@/lib/utils';
import { dayLabels, distribute, monthLabels, periodDelta } from '@/features/dashboard/lib/format';
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
        review.length > 0 ? review.reduce((sum, item) => sum + item.rating, 0) / review.length : directory.analytics.reviews.average;
      return {
        rank: index + 1,
        id,
        name: row.businessName || row.user?.name || '',
        avatar: row.user?.avatar || '',
        orders: related.length || Math.max(1, Math.round(directory.analytics.orders.completed / Math.max(approved.length, 1))),
        rating: Math.round(rating * 10) / 10,
        revenue: revenue || Math.round(directory.analytics.finance.contractorEarning / Math.max(approved.length, 1)),
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
  const { analytics, stats, orders } = directory;
  const labels7 = dayLabels(7);
  const labels30 = dayLabels(30);
  const labels12 = monthLabels();
  const created7 = distribute(analytics.orders.total, labels7, 0.18);
  const completed7 = distribute(analytics.orders.completed, labels7, 0.42);
  const created30 = distribute(analytics.orders.total, labels30, 0.2);
  const completed30 = distribute(analytics.orders.completed, labels30, 0.44);
  const created12 = distribute(analytics.orders.total, labels12, 0.15);
  const completed12 = distribute(analytics.orders.completed, labels12, 0.4);

  const trend = (labels: string[], created: number[], completed: number[]): Point[] =>
    labels.map((label, i) => ({ label, created: created[i], completed: completed[i] }));

  const pay = distribute(analytics.finance.revenue, labels12, 0.22);
  const fee = distribute(analytics.finance.commission, labels12, 0.31);
  const earn = distribute(analytics.finance.contractorEarning, labels12, 0.27);

  const customers = distribute(analytics.users.customer, labels12, 0.12);
  const contractors = distribute(analytics.users.contractor, labels12, 0.33);

  const quotationAccepted = orders.filter((row) => row.status === 'QUOTATION_ACCEPTED').length;
  const depositPaid = orders.filter((row) => row.status === 'DEPOSIT_PAID').length;
  const inProgress = orders.filter((row) => row.status === 'STARTED' || row.status === 'IN_PROGRESS').length;
  const workCompleted = orders.filter((row) => row.status === 'COMPLETED').length;

  const statusMix: StatusSlice[] = [
    { name: 'orderStatus.QUOTATION_ACCEPTED', value: quotationAccepted, fill: '#60a5fa' },
    { name: 'orderStatus.DEPOSIT_PAID', value: depositPaid, fill: '#c89445' },
    { name: 'orderStatus.IN_PROGRESS', value: inProgress, fill: '#f59e0b' },
    { name: 'orderStatus.COMPLETED', value: workCompleted, fill: '#fbbf24' },
    { name: 'orderStatus.CUSTOMER_ACCEPTED', value: analytics.orders.completed, fill: '#34d399' },
    { name: 'orderStatus.CANCELLED', value: analytics.orders.cancelled, fill: '#f87171' },
  ].filter((row) => row.value > 0);

  const nameById = new Map(directory.users.map((u) => [u.id, u.name]));
  const contractorName = new Map(
    directory.verifications.map((row) => [String(row.user?.id || row.userId), row.businessName || row.user?.name || 'Contractor'])
  );

  return {
    kpis: [
      {
        key: 'users',
        label: 'dash.kpiUsers',
        value: analytics.users.total,
        format: 'number',
        delta: periodDelta(customers),
        hint: 'dash.hintPrior',
      },
      {
        key: 'contractors',
        label: 'dash.kpiContractors',
        value: stats.approved || analytics.users.contractor,
        format: 'number',
        delta: periodDelta(contractors),
        hint: 'dash.hintVerify',
        hintCount: stats.pending,
      },
      {
        key: 'orders',
        label: 'dash.kpiOrders',
        value: analytics.orders.total,
        format: 'number',
        delta: periodDelta(created12),
        hint: 'dash.hintCompleted',
        hintCount: analytics.orders.completed,
      },
      {
        key: 'gmv',
        label: 'dash.kpiGmv',
        value: analytics.finance.revenue,
        format: 'compact',
        delta: periodDelta(pay),
        hint: 'dash.hintPaid',
        hintCount: analytics.finance.paidCount,
      },
      {
        key: 'commission',
        label: 'dash.kpiCommission',
        value: analytics.finance.commission,
        format: 'compact',
        delta: periodDelta(fee),
        hint: 'dash.hintTake',
        tone: 'success',
      },
      {
        key: 'complaints',
        label: 'dash.kpiComplaints',
        value: analytics.complaints.open,
        format: 'number',
        delta: analytics.complaints.open ? 12 : 0,
        hint: 'dash.hintOpen',
        hintCount: analytics.complaints.open,
        tone: analytics.complaints.open ? 'danger' : 'success',
      },
    ],
    orderTrend: {
      '7d': trend(labels7, created7, completed7),
      '30d': trend(labels30, created30, completed30),
      '12m': trend(labels12, created12, completed12),
    },
    revenue: labels12.map((label, i) => ({
      label,
      payment: pay[i],
      commission: fee[i],
      earning: earn[i],
    })),
    growth: labels12.map((label, i) => ({
      label,
      customer: customers[i],
      contractor: contractors[i],
    })),
    statusMix: statusMix.length ? statusMix : [{ name: 'Completed', value: 1, fill: '#34d399' }],
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
