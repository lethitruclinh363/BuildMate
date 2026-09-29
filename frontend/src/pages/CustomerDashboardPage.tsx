import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Package, UserRound, Wrench } from 'lucide-react';
import { PageTransition } from '@/components/motion/PageTransition';
import { Spinner } from '@/components/feedback/Spinner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { locationApi } from '@/features/map/services/location.api';
import { repairApi } from '@/features/chat/services/sprint4.api';
import { orderApi } from '@/features/orders/services/order.api';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { CAN_THO } from '@/types/marketplace';

export function CustomerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const [requestCount, setRequestCount] = useState<number | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<{ id: string; title: string; status: string }[]>([]);

  useEffect(() => {
    repairApi
      .mine()
      .then((res) => setRequestCount(res.data.data.length))
      .catch(() => setRequestCount(0));
    orderApi
      .customer()
      .then((res) => {
        const rows = (res.data.data || []) as Array<{ id: string; title: string; status: string }>;
        setOrderCount(rows.filter((o: { status: string }) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length);
        setRecentOrders(
          rows.slice(0, 5).map((o: { id: string; title: string; status: string }) => ({ id: o.id, title: o.title, status: o.status }))
        );
      })
      .catch(() => {
        setOrderCount(0);
        setRecentOrders([]);
      });
    locationApi
      .nearbyContractors(CAN_THO.lat, CAN_THO.lng, 5)
      .then((res) => setNearbyCount((res.data.data || []).length))
      .catch(() => setNearbyCount(0));
  }, []);

  const stats = [
    {
      label: t('customerHome.nearby'),
      value: nearbyCount === null ? '…' : String(nearbyCount),
      icon: UserRound,
    },
    { label: t('customerHome.requests'), value: requestCount === null ? '…' : String(requestCount), icon: Wrench },
    { label: t('customerHome.orders'), value: orderCount === null ? '…' : String(orderCount), icon: Package },
    { label: t('customerHome.messages'), value: requestCount === null ? '…' : String(requestCount), icon: MessageSquare },
  ];

  const activityBars = [
    requestCount || 0,
    orderCount || 0,
    nearbyCount || 0,
    recentOrders.length,
    Math.max(requestCount || 0, 1),
  ];
  const maxBar = Math.max(...activityBars, 1);

  return (
    <PageTransition>
      <div className="mb-8">
        <p className="text-sm text-ink-400">{t('customerHome.greeting')}</p>
        <h1 className="font-display text-3xl text-navy-800">
          {t('customerHome.hello', { name: user?.name.split(' ')[0] || '' })}
        </h1>
      </div>

      {requestCount === null ? <Spinner className="py-6" /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <s.icon className="h-5 w-5 text-copper-500" />
            <p className="mt-4 font-display text-3xl text-navy-800">{s.value}</p>
            <p className="text-sm text-ink-400">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" hover={false}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl text-navy-800">{t('customerHome.activity')}</h2>
          </div>
          {recentOrders.length === 0 && (requestCount || 0) === 0 ? (
            <p className="text-sm text-ink-500">{t('customerHome.activityEmpty')}</p>
          ) : (
            <>
              <div className="flex h-40 items-end gap-2">
                {activityBars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-lg bg-navy-800/90"
                    style={{ height: `${Math.max(12, Math.round((h / maxBar) * 100))}%` }}
                  />
                ))}
              </div>
              <ul className="mt-4 space-y-2">
                {recentOrders.map((row) => (
                  <li key={row.id}>
                    <Link to={`/customer/orders/${row.id}`} className="text-sm font-medium text-copper-600 hover:underline">
                      {row.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card hover={false}>
          <h2 className="font-display text-xl text-navy-800">{t('customerHome.mapTitle')}</h2>
          <p className="mt-1 text-sm text-ink-400">{t('customerHome.mapHint')}</p>
          <Button asChild className="mt-4" size="sm" variant="copper">
            <Link to="/customer/explore">{t('customerHome.openSearch')}</Link>
          </Button>
          <Button asChild className="mt-2" size="sm" variant="outline">
            <Link to="/customer/request/history">{t('customerHome.history')}</Link>
          </Button>
        </Card>
      </div>
    </PageTransition>
  );
}
