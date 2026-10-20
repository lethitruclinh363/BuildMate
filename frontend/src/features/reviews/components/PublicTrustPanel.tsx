import { BadgeCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/locales';
import type { ReputationSnapshot } from '../types/reputation.types';
import { formatPercent } from './ReputationSummary';
import { formatScore } from './reputationDisplay';

export function PublicTrustPanel({
  name,
  verified,
  reputation,
  reviewAverage,
  reviewCount,
  completionLabel,
  onTimeLabel,
}: {
  name: string;
  verified: boolean;
  reputation?: ReputationSnapshot | null;
  reviewAverage: number | null;
  reviewCount: number;
  completionLabel: string;
  onTimeLabel: string;
}) {
  const { t } = useI18n();
  const published = Boolean(reputation?.published && reputation.score != null);
  const completion = reputation?.completion.percent;
  const onTime = reputation?.onTime.percent;

  return (
    <Card hover={false} data-public-trust={published ? 'ready' : 'insufficient'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-copper-500">{t('reputation.frameTitle')}</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-navy-800">{name}</h2>
          {verified ? (
            <Badge tone="success" className="mt-2">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              {t('common.verified')}
            </Badge>
          ) : null}
        </div>
        <p className="text-lg font-semibold text-navy-800">
          {published && reputation?.grade
            ? t('reputation.scoreWithGrade', {
                grade: t(`reputation.${reputation.grade}`),
                score: formatScore(reputation.score as number),
              })
            : t('reputation.insufficient')}
        </p>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={t('reputation.reviewsTitle')}
          value={reviewCount > 0 && reviewAverage != null ? `${reviewAverage.toFixed(1)}/5` : t('explore.noRating')}
          hint={reviewCount > 0 ? t('public.reviewTotal', { n: reviewCount }) : ''}
        />
        <Stat label={t('review.totalLabel')} value={String(reviewCount)} hint="" />
        <Stat
          label={completionLabel}
          value={completion == null ? t('reputation.cardEmpty') : `${formatPercent(completion)}%`}
          hint=""
        />
        <Stat
          label={onTimeLabel}
          value={onTime == null ? t('reputation.cardEmpty') : `${formatPercent(onTime)}%`}
          hint=""
        />
      </dl>
      <p className="mt-4 text-sm text-ink-500">{t('reputation.autoNote')}</p>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-paper-50 px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-navy-800">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
