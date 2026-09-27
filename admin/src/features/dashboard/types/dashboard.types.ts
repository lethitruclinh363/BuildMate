export type TrendRange = '7d' | '30d' | '12m';

export interface KpiItem {
  key: string;
  label: string;
  value: number;
  format: 'number' | 'vnd' | 'compact';
  delta: number;
  hint: string;
  hintCount?: number;
  tone?: 'default' | 'danger' | 'success';
}

export interface Point {
  label: string;
  created?: number;
  completed?: number;
  payment?: number;
  commission?: number;
  earning?: number;
  customer?: number;
  contractor?: number;
}

export interface StatusSlice {
  name: string;
  value: number;
  fill: string;
}

export interface ActivityItem {
  id: string;
  tone: 'success' | 'money' | 'star' | 'warn' | 'info';
  title: string;
  body: string;
  at: string;
}

export interface HealthStatus {
  backend: 'ONLINE' | 'OFFLINE';
  database: 'CONNECTED' | 'DOWN';
  socket: 'ACTIVE' | 'STANDBY';
  storage: 'AVAILABLE' | 'UNAVAILABLE';
  checkedAt: string;
}

export interface TopContractorRow {
  rank: number;
  id: string;
  name: string;
  avatar: string;
  orders: number;
  rating: number;
  revenue: number;
}

export interface RecentOrderRow {
  id: string;
  orderCode: string;
  title: string;
  customerId: string;
  contractorId: string;
  customer: string;
  contractor: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface SearchHit {
  id: string;
  kind: 'user' | 'order' | 'contractor' | 'payment';
  title: string;
  subtitle: string;
  to: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export interface DashboardOverview {
  kpis: KpiItem[];
  orderTrend: Record<TrendRange, Point[]>;
  revenue: Point[];
  growth: Point[];
  statusMix: StatusSlice[];
  activity: ActivityItem[];
  health: HealthStatus;
  topContractors: TopContractorRow[];
  recentOrders: RecentOrderRow[];
  searchIndex: SearchHit[];
  notifications: AdminNotification[];
  unread: number;
  refreshedAt: number;
}
