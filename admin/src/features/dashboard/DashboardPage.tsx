import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Building2, CreditCard, Percent, ShieldAlert, Users } from 'lucide-react';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { HeroHeader } from '@/features/dashboard/components/HeroHeader';
import { HealthPanel } from '@/features/dashboard/components/HealthPanel';
import { KPICard } from '@/features/dashboard/components/KPICard';
import { LiveActivityFeed } from '@/features/dashboard/components/LiveActivityFeed';
import { PerformanceTable } from '@/features/dashboard/components/PerformanceTable';
import { RecentOrdersTable } from '@/features/dashboard/components/RecentOrdersTable';
import { useAdminSocket } from '@/features/dashboard/hooks/useAdminSocket';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';

const OrderTrendChart = lazy(() =>
  import('@/features/dashboard/components/OrderTrendChart').then((m) => ({ default: m.OrderTrendChart }))
);
const RevenueChart = lazy(() =>
  import('@/features/dashboard/components/RevenueChart').then((m) => ({ default: m.RevenueChart }))
);
const UserGrowthChart = lazy(() =>
  import('@/features/dashboard/components/UserGrowthChart').then((m) => ({ default: m.UserGrowthChart }))
);
const OrderStatusChart = lazy(() =>
  import('@/features/dashboard/components/OrderStatusChart').then((m) => ({ default: m.OrderStatusChart }))
);

const icons = {
  users: <Users className="h-4 w-4" />,
  contractors: <Building2 className="h-4 w-4" />,
  orders: <BadgeCheck className="h-4 w-4" />,
  gmv: <CreditCard className="h-4 w-4" />,
  commission: <Percent className="h-4 w-4" />,
  complaints: <ShieldAlert className="h-4 w-4" />,
};

export function DashboardPage() {
  const socketLive = useAdminSocket();
  const { data, loading, error, reload, secondsAgo } = useDashboard();

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorState body={error || undefined} onRetry={reload} />;

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      <HeroHeader secondsAgo={secondsAgo} health={data.health} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {data.kpis.map((item) => (
          <KPICard key={item.key} item={item} icon={icons[item.key as keyof typeof icons]} />
        ))}
      </div>

      <Suspense fallback={<Spinner />}>
        <div className="grid gap-6 xl:grid-cols-2">
          <OrderTrendChart series={data.orderTrend} />
          <RevenueChart data={data.revenue} />
          <UserGrowthChart data={data.growth} />
          <OrderStatusChart data={data.statusMix} />
        </div>
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <LiveActivityFeed items={data.activity} />
        <HealthPanel health={{ ...data.health, socket: socketLive ? 'ACTIVE' : data.health.socket }} />
      </div>

      <PerformanceTable rows={data.topContractors} />
      <RecentOrdersTable rows={data.recentOrders} />
    </motion.div>
  );
}
