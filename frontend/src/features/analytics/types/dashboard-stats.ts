export interface MonthRevenuePoint {
  month: string;
  net: number;
  gross: number;
}

export interface MonthOrderPoint {
  month: string;
  count: number;
}

export interface DashboardRequestRow {
  id: string;
  title: string;
  status: string;
  address: string;
  category?: string;
  createdAt: string;
}

export interface DashboardOrderRow {
  id: string;
  orderCode: string;
  title: string;
  status: string;
  amount: number;
  createdAt: string;
}

export interface ContractorDashboardStats {
  pendingRequests: number;
  openOrders: number;
  inProgressOrders: number;
  monthNetRevenue: number;
  avgRating: number | null;
  revenueByMonth: MonthRevenuePoint[];
  ordersByMonth: MonthOrderPoint[];
  recentRequests: DashboardRequestRow[];
  needsAssign: DashboardOrderRow[];
}
