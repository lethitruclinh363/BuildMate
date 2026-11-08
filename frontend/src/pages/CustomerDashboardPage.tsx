import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Package, UserRound, Wrench } from 'lucide-react';
import { PageTransition } from '@/components/motion/PageTransition';
import { Spinner } from '@/components/feedback/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { chatApi, repairApi } from '@/features/chat/services/sprint4.api';
import { locationApi } from '@/features/map/services/location.api';
import { readExplore } from '@/features/map/lib/explore-memory';
import { orderApi } from '@/features/orders/services/order.api';
import { useOrderLiveStore } from '@/features/orders/store/order-live.store';
import { orderStatusTone } from '@/features/orders/types/orderStatus';
import { materialRequirementApi } from '@/lib/material-requirement-api';
import { useReturnState } from '@/lib/navigation';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { CAN_THO } from '@/types/marketplace';

function isOpenRepairStatus(status: string) {
  return status !== 'CANCELLED' && status !== 'CUSTOMER_ACCEPTED';
}

export function CustomerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const back = useReturnState();
  const liveVersion = useOrderLiveStore((s) => s.version);
  const [requestCount, setRequestCount] = useState<number | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<{ id: string; title: string; status: string }[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<{ id: string; title: string; status: string }[]>([]);

  useEffect(() => {
    repairApi
      .mine()
      .then((res) => setRequestCount(res.data.data.length))
      .catch(() => setRequestCount(0));
    orderApi
      .customer()
      .then((res) => {
        const rows = (res.data.data || []) as Array<{ id: string; title: string; status: string }>;
        setOrderCount(rows.filter((row) => isOpenRepairStatus(row.status)).length);
        setRecentOrders(rows.slice(0, 5).map((row) => ({ id: row.id, title: row.title, status: row.status })));
      })
      .catch(() => {
        setOrderCount(0);
        setRecentOrders([]);
      });
    materialRequirementApi
      .mine()
      .then((res) => {
        const rows = res.data.data || [];
        setRecentMaterials(
          rows.slice(0, 5).map((row) => ({
            id: row.id,
            title: row.title || row.requestTitle || row.requestCode || row.items?.[0]?.name || row.id,
            status: row.status,
          }))
        );
      })
      .catch(() => setRecentMaterials([]));
    chatApi
      .rooms()
      .then((res) => setMessageCount((res.data.data || []).length))
      .catch(() => setMessageCount(0));
    const origin = readExplore()?.origin;
    const lat = Number(origin?.lat);
    const lng = Number(origin?.lng);
    locationApi
      .nearbyContractors(Number.isFinite(lat) ? lat : CAN_THO.lat, Number.isFinite(lng) ? lng : CAN_THO.lng, 5)
      .then((res) => setNearbyCount((res.data.data || []).length))
      .catch(() => setNearbyCount(0));
  }, [liveVersion]);

  const stats = [
    { label: t('customerHome.nearby'), value: nearbyCount, icon: UserRound, to: '/customer/explore' },
    { label: t('customerHome.requests'), value: requestCount, icon: Wrench, to: '/customer/request/history' },
    { label: t('customerHome.orders'), value: orderCount, icon: Package, to: '/customer/orders' },
    { label: t('customerHome.messages'), value: messageCount, icon: MessageSquare, to: '/customer/chat' },
  ];

  const loading = requestCount === null || orderCount === null;
  const hasActivity = recentOrders.length > 0 || recentMaterials.length > 0;

  return (
    <PageTransition>
      <div className="mb-8">
        <p className="text-sm text-ink-400">{t('customerHome.greeting')}</p>
        <h1 className="font-display text-3xl text-navy-800">
          {t('customerHome.hello', { name: user?.name?.split(' ')[0] || '' })}
        </h1>
      </div>

      {loading ? <Spinner className="py-6" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            state={back}
            className="rounded-xl border border-navy-800/10 bg-white px-4 py-3 transition hover:border-copper-300"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-500">{item.label}</p>
              <item.icon className="h-4 w-4 text-copper-600" />
            </div>
            <p className="mt-1 text-2xl font-semibold text-navy-800">{item.value === null ? '…' : String(item.value)}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-navy-800">{t('customerHome.recent')}</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/customer/orders">{t('customerHome.viewOrders')}</Link>
          </Button>
        </div>

        {!hasActivity ? (
          <div className="rounded-xl border border-dashed border-navy-800/15 bg-white px-6 py-10 text-center">
            <p className="text-sm text-ink-500">{t('customerHome.activityEmpty')}</p>
            <div className="mt-4">
              <Button asChild size="sm" variant="copper">
                <Link to="/customer/explore">{t('customerHome.openSearch')}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {recentOrders.length ? (
              <ul className="space-y-2.5">
                {recentOrders.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/customer/orders/${row.id}`}
                      state={back}
                      className="group flex items-center justify-between gap-4 rounded-xl border border-navy-800/10 bg-white px-5 py-3.5 transition hover:border-copper-300 hover:bg-paper-50"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-navy-800 group-hover:text-copper-700">
                        {row.title}
                      </span>
                      <Badge tone={orderStatusTone(row.status)} className="shrink-0 whitespace-nowrap">
                        {t(`orders.customerStatus.${row.status}`)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {recentMaterials.length ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-navy-800">{t('customerHome.materialRecent')}</h3>
                <ul className="space-y-2.5">
                  {recentMaterials.map((row) => (
                    <li key={row.id}>
                      <Link
                        to={`/customer/material-lists/${row.id}`}
                        state={back}
                        className="group flex items-center justify-between gap-4 rounded-xl border border-navy-800/10 bg-white px-5 py-3.5 transition hover:border-copper-300 hover:bg-paper-50"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-navy-800 group-hover:text-copper-700">
                          {row.title}
                        </span>
                        <Badge tone="mist" className="shrink-0 whitespace-nowrap">
                          {t(`mrl.status.${row.status}`)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </PageTransition>
  );
}
