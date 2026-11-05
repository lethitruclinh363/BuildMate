import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { mediaUrl } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { reviewApi } from '../services/review.api';
import type { ReviewListPayload, ReviewTargetType } from '../types/review.types';

const PAGE_SIZE = 8;

export function PublicReviewList({ targetUserId, targetType }: { targetUserId: string; targetType: ReviewTargetType }) {
  const { t, locale } = useI18n();
  const [star, setStar] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<ReviewListPayload | null>(null);
  const dateTag = locale === 'en' ? 'en-GB' : 'vi-VN';

  useEffect(() => {
    if (!targetUserId) return;
    let active = true;
    reviewApi
      .forUser(targetUserId, targetType, {
        rating: star === 'all' ? undefined : star,
        sort,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (active) setPayload(res.data.data);
      })
      .catch(() => {
        if (active) setPayload({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
      });
    return () => {
      active = false;
    };
  }, [targetUserId, targetType, star, sort, page]);

  const count = payload?.count || 0;
  const average = payload?.average || 0;
  const distribution = payload?.distribution || {};
  const maxBar = Math.max(1, ...[1, 2, 3, 4, 5].map((value) => Number(distribution[value] || 0)));
  const items = payload?.items || [];
  const total = payload?.total ?? items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <h2 className="font-display text-2xl text-navy-800">{t('public.reviewsTitle')}</h2>
      {count > 0 ? (
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
          <Star className="h-4 w-4 fill-copper-400 text-copper-400" />
          {t('public.reviewScore', { score: average.toFixed(1) })}
          <span className="font-normal text-ink-400">· {t('public.reviewTotal', { n: count })}</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-500">{t('public.noReviews')}</p>
      )}

      <Card hover={false} className="mt-4">
        <h3 className="text-sm font-semibold text-navy-800">{t('review.distribution')}</h3>
        <div className="mt-3 space-y-2">
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

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={star === 'all'} onClick={() => { setStar('all'); setPage(1); }}>{t('public.allStars')}</FilterChip>
        {[5, 4, 3, 2, 1].map((value) => (
          <FilterChip key={value} active={star === value} onClick={() => { setStar(value); setPage(1); }}>{t('public.stars', { n: value })}</FilterChip>
        ))}
        <FilterChip active={sort === 'newest'} onClick={() => { setSort('newest'); setPage(1); }}>{t('review.newest')}</FilterChip>
        <FilterChip active={sort === 'oldest'} onClick={() => { setSort('oldest'); setPage(1); }}>{t('review.oldest')}</FilterChip>
      </div>

      {items.length ? (
        <div className="mt-4 space-y-3">
          {items.map((row) => (
            <Card key={row.id} hover={false}>
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-navy-800 text-sm text-paper-50">
                  {row.customerAvatar ? (
                    <img src={mediaUrl(row.customerAvatar)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (row.customerName || 'K').slice(0, 1)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-navy-800">{row.customerName || t('public.customer')}</p>
                    <p className="text-xs text-ink-400">{row.createdAt ? new Date(row.createdAt).toLocaleDateString(dateTag) : ''}</p>
                  </div>
                  <p className="mt-1 text-copper-500" aria-label={t('public.stars', { n: row.rating })}>
                    {'★'.repeat(row.rating)}{'☆'.repeat(Math.max(0, 5 - row.rating))}
                  </p>
                  {row.comment ? <p className="mt-2 text-sm leading-6 text-ink-600">{row.comment}</p> : null}
                  {row.contractorReply ? (
                    <p className="mt-3 rounded-2xl bg-navy-800/5 px-3 py-2 text-sm leading-6 text-navy-800">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-400">{t('review.providerReply')}</span>
                      {row.contractorReply}
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-400">{t('public.noReviews')}</p>
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button type="button" className="font-semibold text-navy-800 disabled:text-ink-300" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            {t('review.prev')}
          </button>
          <span className="text-ink-500">{page}/{pageCount}</span>
          <button type="button" className="font-semibold text-navy-800 disabled:text-ink-300" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>
            {t('review.next')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? 'bg-navy-800 text-white' : 'bg-white text-navy-800 ring-1 ring-navy-800/10'}`}
    >
      {children}
    </button>
  );
}
