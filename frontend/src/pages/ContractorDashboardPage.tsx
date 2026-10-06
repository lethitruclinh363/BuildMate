import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  Star,
  Wallet,
  Wrench,
} from 'lucide-react';
import { VerificationBadge } from '@/components/contractor/VerificationBadge';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ContractorOrderTrendChart } from '@/features/analytics/components/ContractorOrderTrendChart';
import { ContractorRevenueChart } from '@/features/analytics/components/ContractorRevenueChart';
import { useContractorDashboardStats } from '@/features/analytics/hooks/useContractorDashboardStats';
import { ActivationPanel } from '@/components/partner/ActivationPanel';
import { useContractorWorkspace } from '@/hooks/useContractorWorkspace';
import { vnd } from '@/lib/partner-api';
import { useReturnState } from '@/lib/navigation';
import { labeled, useI18n } from '@/locales';

function OpsKpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-navy-800/10 bg-white px-4 py-3">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-800">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function ContractorDashboardPage() {
  const { data: workspace, loading: workspaceLoading, refresh } = useContractorWorkspace();
  const { data: stats, loading: statsLoading, error: statsError, reload: reloadStats } = useContractorDashboardStats();
  const { t } = useI18n();
  const back = useReturnState();

  if (workspaceLoading || !workspace) return <DashboardSkeleton />;

  const { profile, store } = workspace;
  const catalogKpis = [
    { label: t('contractorHome.kpiServices'), value: workspace.stats.services },
    { label: t('contractorHome.kpiDocs'), value: workspace.stats.documents },
  ];
  const modules = [
    { to: '/contractor/requests', label: t('contractorHome.modRequests'), hint: t('contractorHome.modRequestsHint'), icon: Inbox },
    { to: '/contractor/orders', label: t('nav.contractor.orders'), hint: t('contractorHome.nextOrder'), icon: ClipboardList },
    { to: '/contractor/earnings', label: t('nav.contractor.revenue'), hint: t('contractorHome.modEarningsHint'), icon: Wallet },
    { to: '/contractor/reputation', label: t('nav.contractor.reviews'), hint: t('contractorHome.modReviewsHint'), icon: Star },
    { to: '/contractor/verification', label: t('contractorHome.modVerify'), hint: t('contractorHome.modVerifyHint'), icon: ClipboardCheck },
    { to: '/contractor/services', label: t('contractorHome.modServices'), hint: t('contractorHome.modServicesHint'), icon: Wrench },
  ];

  const banner =
    profile.verificationStatus === 'SUBMITTED'
      ? t('contractorHome.submitted')
      : profile.verificationStatus === 'REJECTED'
        ? t('contractorHome.rejected')
        : t('contractorHome.draft');

  return (
    <PageTransition>
      <PageHeader
        eyebrow={t('contractorHome.eyebrow')}
        title={profile.businessName || t('contractorHome.setupTitle')}
        description={t('contractorHome.description')}
        actions={<VerificationBadge status={profile.verificationStatus} />}
      />

      {profile.verificationStatus === 'APPROVED' ? (
        <ActivationPanel activation={workspace.activation} onChanged={() => void refresh()} />
      ) : (
        <Card hover={false} className="mb-6 border-copper-200 bg-copper-50/70">
          <p className="font-display text-xl text-navy-800">{banner}</p>
          <p className="mt-1 text-sm text-ink-600">{profile.rejectionReason || t('contractorHome.locked')}</p>
          <Button asChild variant="copper" className="mt-4" size="sm">
            <Link to="/contractor/verification">
              {t('contractorHome.openDesk')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Card>
      )}

      {statsError ? (
        <div className="mb-6">
          <ErrorState body={statsError} onRetry={reloadStats} />
        </div>
      ) : statsLoading || !stats ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} hover={false} className="h-24 animate-pulse bg-mist-100">
              <span className="sr-only">{t('common.loading')}</span>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <OpsKpi label={t('contractorHome.opsPending')} value={String(stats.pendingRequests)} />
            <OpsKpi label={t('contractorHome.opsOpen')} value={String(stats.openOrders)} />
            <OpsKpi label={t('contractorHome.opsProgress')} value={String(stats.inProgressOrders)} />
            <OpsKpi label={t('contractorHome.opsRevenue')} value={vnd(stats.monthNetRevenue)} />
            <OpsKpi
              label={t('contractorHome.opsRating')}
              value={stats.avgRating == null ? '—' : String(stats.avgRating)}
              hint={stats.avgRating == null ? t('contractorHome.opsRatingEmpty') : undefined}
            />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <ContractorRevenueChart data={stats.revenueByMonth} />
            <ContractorOrderTrendChart data={stats.ordersByMonth} />
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-navy-800">{t('contractorHome.recentRequests')}</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/contractor/requests">{t('contractorHome.viewAll')}</Link>
                </Button>
              </div>
              {stats.recentRequests.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<Inbox className="h-5 w-5" />}
                    title={t('contractorHome.recentEmpty')}
                    body={t('contractorHome.recentEmptyBody')}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-navy-800/10">
                  {stats.recentRequests.map((row) => (
                    <li key={row.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-navy-800">{row.title}</p>
                        <Badge tone="mist">{labeled(t, 'status', row.status)}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-ink-400">{row.address || t('orders.siteFallback')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-navy-800">{t('contractorHome.needsAssign')}</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/contractor/orders">{t('contractorHome.viewAll')}</Link>
                </Button>
              </div>
              {stats.needsAssign.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<ClipboardList className="h-5 w-5" />}
                    title={t('contractorHome.assignEmpty')}
                    body={t('contractorHome.assignEmptyBody')}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-navy-800/10">
                  {stats.needsAssign.map((row) => (
                    <li key={row.id}>
                      <Link
                        to={`/contractor/orders/${row.id}`}
                        state={back}
                        className="block py-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[11px] text-copper-600">{row.orderCode}</p>
                            <p className="font-medium text-navy-800">{row.title}</p>
                          </div>
                          <Badge tone="copper">{labeled(t, 'orders.status', row.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink-500">{vnd(row.amount)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {catalogKpis.map((s) => (
          <div key={s.label} className="rounded-xl border border-navy-800/10 bg-white px-4 py-3">
            <p className="text-sm text-ink-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-navy-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 border-t border-navy-800/10 pt-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-navy-800">{t('contractorHome.storefront')}</h2>
            {store ? (
              <Badge tone="success">{labeled(t, 'status', store.status)}</Badge>
            ) : (
              <Badge>{t('contractorHome.notPublished')}</Badge>
            )}
          </div>
          {store ? (
            <div className="mt-4">
              <p className="font-display text-2xl text-navy-800">{store.name}</p>
              <p className="text-sm text-ink-400">
                {store.address} · {store.serviceRadiusKm} {t('common.km')} · {t(`storeType.${store.storeType}`)}
              </p>
              <p className="mt-3 text-sm leading-6 text-ink-600">{store.description}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-400">{t('contractorHome.publishHint')}</p>
          )}
        </section>
        <section>
          <h2 className="text-lg font-semibold text-navy-800">{t('contractorHome.nextTitle')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>
              <Link to="/contractor/requests" className="font-semibold text-copper-600">
                {t('contractorHome.modRequests')}
              </Link>
            </li>
            <li>
              <Link to="/contractor/orders" className="font-semibold text-copper-600">
                {t('nav.contractor.orders')}
              </Link>
            </li>
            <li>
              <Link to="/contractor/earnings" className="font-semibold text-copper-600">
                {t('nav.contractor.revenue')}
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="h-full">
              <item.icon className="h-5 w-5 text-copper-500" />
              <p className="mt-4 font-display text-lg text-navy-800">{item.label}</p>
              <p className="text-sm text-ink-400">{item.hint}</p>
            </Card>
          </Link>
        ))}
      </div>
    </PageTransition>
  );
}
