import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { itemListClass, ListRow } from '@/components/ui/surfaces';
import { labeled, useI18n } from '@/locales';
import { ComplaintStatusBadge } from '../components/ComplaintStatusBadge';
import { ComplaintTimeline } from '../components/ComplaintTimeline';
import { useMyComplaints } from '../hooks/useComplaints';

export function CustomerComplaintsPage() {
  const { t, locale } = useI18n();
  const { items, loading, error, reload } = useMyComplaints();
  const tag = locale === 'en' ? 'en-US' : 'vi-VN';

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState body={error} onRetry={reload} />;

  return (
    <PageTransition>
      <PageHeader eyebrow={t('complaint.eyebrow')} title={t('complaint.title')} description={t('complaint.desc')} />
      {items.length === 0 ? (
        <EmptyState icon={<Inbox className="h-5 w-5" />} title={t('complaint.empty')} body={t('complaint.emptyBody')} />
      ) : (
        <div className={itemListClass}>
          {items.map((row) => (
            <ListRow key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-400">{new Date(row.createdAt).toLocaleString(tag)}</p>
                  <p className="mt-1 font-display text-lg text-navy-800">{labeled(t, 'complaintReason', row.reason)}</p>
                  <p className="mt-2 text-sm text-ink-600">{row.description}</p>
                </div>
                <ComplaintStatusBadge status={row.status} />
              </div>
              <div className="mt-4">
                <ComplaintTimeline status={row.status} />
              </div>
              {row.adminNote ? <p className="mt-3 text-sm text-copper-700">{row.adminNote}</p> : null}
              <Link to={`/customer/orders/${row.orderId}`} className="mt-3 inline-block text-sm font-semibold text-navy-800">
                {t('common.viewDetail')}
              </Link>
            </ListRow>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
