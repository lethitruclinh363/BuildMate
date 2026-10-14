import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageTransition } from '@/components/motion/PageTransition';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { itemListClass, ListRow } from '@/components/ui/surfaces';
import { TextArea } from '@/components/ui/TextArea';
import { reviewApi } from '@/features/reviews/services/review.api';
import type { Review, ReviewListPayload } from '@/features/reviews/types/review.types';
import { getApiErrorMessage } from '@/lib/api';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { useToastStore } from '@/store/toast.store';

type StarFilter = 'all' | 1 | 2 | 3 | 4 | 5;

const PAGE_SIZE = 10;

export function StoreReviewsPage() {
  const { t, locale } = useI18n();
  const pushToast = useToastStore((state) => state.push);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState<ReviewListPayload | null>(null);
  const [star, setStar] = useState<StarFilter>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [replyFor, setReplyFor] = useState('');
  const [replyText, setReplyText] = useState('');
  const [reportFor, setReportFor] = useState('');
  const [reportText, setReportText] = useState('');
  const [busy, setBusy] = useState(false);

  function load(nextPage = page) {
    setLoading(true);
    setError('');
    reviewApi
      .storeReviews({
        rating: star === 'all' ? undefined : star,
        sort,
        page: nextPage,
        pageSize: PAGE_SIZE,
      })
      .then((res) => setReviews(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(page);
    // load is recreated each render; the query fields are the real dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [star, sort, page]);

  async function sendReply(review: Review) {
    setBusy(true);
    try {
      await reviewApi.reply(review.id, replyText.trim());
      setReplyFor('');
      setReplyText('');
      pushToast({ kind: 'success', title: t('review.replySaved') });
      load(page);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendReport(review: Review) {
    setBusy(true);
    try {
      await reviewApi.report(review.id, reportText.trim());
      setReportFor('');
      setReportText('');
      pushToast({ kind: 'success', title: t('review.reportSent') });
      load(page);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !reviews) return <DashboardSkeleton />;
  if (error && !reviews) return <ErrorState body={error} onRetry={() => load(page)} />;

  const average = reviews?.average || 0;
  const count = reviews?.count || 0;
  const distribution = reviews?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const maxBar = Math.max(1, ...[1, 2, 3, 4, 5].map((value) => Number(distribution[value] || 0)));
  const dateTag = locale === 'en' ? 'en-GB' : 'vi-VN';
  const items = reviews?.items || [];
  const total = reviews?.total ?? items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageTransition>
      <PageHeader eyebrow={t('review.storeReviewsEyebrow')} title={t('review.storeReviewsTitle')} description={t('review.storeReviewsDesc')} />
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card hover={false} className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('review.average')}</p>
          <p className="mt-1 text-2xl font-semibold text-navy-800">{count ? average.toFixed(1) : t('review.noAverage')}</p>
        </Card>
        <Card hover={false} className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{t('review.totalLabel')}</p>
          <p className="mt-1 text-2xl font-semibold text-navy-800">{count}</p>
        </Card>
      </div>

      <Card hover={false} className="mt-6">
        <h2 className="font-display text-xl text-navy-800">{t('review.distribution')}</h2>
        <div className="mt-4 space-y-2">
          {[5, 4, 3, 2, 1].map((value) => {
            const amount = Number(distribution[value] || 0);
            return (
              <div key={value} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="text-navy-800">{value} ★</span>
                <span className="h-2 overflow-hidden rounded-full bg-navy-800/8">
                  <span className="block h-full rounded-full bg-copper-400" style={{ width: count ? `${(amount / maxBar) * 100}%` : '0%' }} />
                </span>
                <span className="text-right text-ink-500">{amount}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Filter active={star === 'all'} onClick={() => { setStar('all'); setPage(1); }}>{t('public.allStars')}</Filter>
        {([5, 4, 3, 2, 1] as const).map((value) => (
          <Filter key={value} active={star === value} onClick={() => { setStar(value); setPage(1); }}>{t('public.stars', { n: value })}</Filter>
        ))}
        <Filter active={sort === 'newest'} onClick={() => { setSort('newest'); setPage(1); }}>{t('review.newest')}</Filter>
        <Filter active={sort === 'oldest'} onClick={() => { setSort('oldest'); setPage(1); }}>{t('review.oldest')}</Filter>
      </div>

      {count === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Star className="h-5 w-5" />} title={t('review.emptyCustomer')} body={t('review.storeReviewsDesc')} />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Star className="h-5 w-5" />} title={t('review.filterEmpty')} body={t('review.filterEmptyBody')} />
        </div>
      ) : (
        <div className={`mt-4 ${itemListClass}`}>
          {items.map((row) => (
            <ListRow key={row.id}>
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-navy-800 text-sm text-paper-50">
                  {row.customerAvatar ? <img src={mediaUrl(row.customerAvatar)} alt="" className="h-full w-full object-cover" /> : (row.customerName || 'K').slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-navy-800">{row.customerName || t('public.customer')}</p>
                    <p className="text-xs text-ink-400">{new Date(row.createdAt).toLocaleDateString(dateTag)}</p>
                  </div>
                  <p className="mt-1 text-copper-500" aria-label={t('public.stars', { n: row.rating })}>{'★'.repeat(row.rating)}{'☆'.repeat(Math.max(0, 5 - row.rating))}</p>
                  {row.orderCode ? (
                    <p className="mt-1 text-xs text-ink-400">
                      {row.materialOrderId ? t('review.materialOrderCode') : t('review.orderCode')}: {row.orderCode}
                    </p>
                  ) : null}
                  {row.materialOrderId && (row.orderStatus === 'COMPLETED' || row.orderStatus === 'CUSTOMER_RECEIVED') ? (
                    <p className="mt-1 text-xs font-semibold text-navy-800">{t('review.received')}</p>
                  ) : null}
                  {row.comment ? <p className="mt-2 text-sm leading-6 text-ink-600">{row.comment}</p> : null}
                  {row.contractorReply ? (
                    <p className="mt-3 rounded-2xl bg-navy-800/5 px-3 py-2 text-sm leading-6 text-navy-800">{row.contractorReply}</p>
                  ) : null}
                  {replyFor === row.id ? (
                    <div className="mt-3 space-y-2">
                      <TextArea label={t('review.reply')} value={replyText} placeholder={t('review.replyPlaceholder')} onChange={(event) => setReplyText(event.target.value)} />
                      <Button type="button" disabled={busy || replyText.trim().length < 2} onClick={() => void sendReply(row)}>{t('review.replySave')}</Button>
                    </div>
                  ) : null}
                  {reportFor === row.id && !row.reported ? (
                    <div className="mt-3 space-y-2">
                      <TextArea label={t('review.reportHint')} value={reportText} onChange={(event) => setReportText(event.target.value)} />
                      <Button type="button" variant="outline" disabled={busy || reportText.trim().length < 8} onClick={() => void sendReport(row)}>{t('review.reportSend')}</Button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" className="text-sm font-semibold text-navy-800 underline" onClick={() => { setReplyFor(row.id); setReplyText(row.contractorReply || ''); setReportFor(''); }}>
                      {t('review.reply')}
                    </button>
                    {row.reported ? (
                      <span className="text-sm text-ink-400">{t('review.reported')}</span>
                    ) : (
                      <button type="button" className="text-sm font-semibold text-ink-500 underline" onClick={() => { setReportFor(row.id); setReportText(''); setReplyFor(''); }}>
                        {t('review.report')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </ListRow>
          ))}
        </div>
      )}
      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t('review.prev')}</Button>
          <span className="text-sm text-ink-500">{page} / {pageCount}</span>
          <Button type="button" variant="outline" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>{t('review.next')}</Button>
        </div>
      ) : null}
    </PageTransition>
  );
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${active ? 'bg-navy-800 text-white' : 'bg-white text-navy-800 ring-1 ring-navy-800/10'}`}>
      {children}
    </button>
  );
}
