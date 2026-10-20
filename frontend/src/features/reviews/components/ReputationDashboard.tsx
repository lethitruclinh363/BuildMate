import type { ReactNode } from 'react';
import { BadgeCheck, CheckCircle2, Clock, LifeBuoy, Star } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';
import type { ReputationSnapshot } from '../types/reputation.types';
import { formatPercent } from './ReputationSummary';
import { formatScore, gaugeRatio, measuredBar, shortfall, weightPercent } from './reputationDisplay';

const GAUGE = { cx: 140, cy: 118, r: 100, stroke: 14 };

export function ReputationDashboard({
  reputation,
  labels,
}: {
  reputation: ReputationSnapshot;
  labels: { reviews: string; completion: string; onTime: string; complaints: string };
}) {
  const { t, locale } = useI18n();
  const published = reputation.published && reputation.score != null;
  const ratio = gaugeRatio(reputation.score, published);
  const dateTag = locale === 'en' ? 'en-GB' : 'vi-VN';
  const updated = reputation.updatedAt
    ? new Date(reputation.updatedAt).toLocaleString(dateTag)
    : t('reputation.noUpdate');
  const missing = shortfall(
    reputation.validOrders,
    reputation.reviews.count,
    reputation.requirements.minOrders,
    reputation.requirements.minReviews
  );
  const bars = [
    bar(labels.reviews, reputation.weights?.S, measuredBar(reputation.reviews.component, reputation.reviews.sufficient)),
    bar(labels.completion, reputation.weights?.C, measuredBar(reputation.completion.component, reputation.completion.sufficient)),
    bar(labels.onTime, reputation.weights?.T, measuredBar(reputation.onTime.component, reputation.onTime.sufficient)),
    bar(labels.complaints, reputation.weights?.Q, measuredBar(reputation.complaints.component, reputation.complaints.sufficient)),
  ];

  return (
    <div data-reputation-state={published ? 'ready' : 'insufficient'}>
      <Card hover={false}>
        {published ? (
          <div className="mb-3 flex justify-end">
            <BadgeCheck className="h-5 w-5 text-copper-500" aria-hidden />
          </div>
        ) : null}
        <div
          className="mx-auto flex max-w-md rounded-full bg-paper-100 p-1 text-sm"
          role="group"
          aria-label={t('reputation.scoreLabel')}
        >
          <span
            className={cn(
              'flex-1 rounded-full px-3 py-1.5 text-center',
              published ? 'text-ink-400' : 'bg-navy-800 font-semibold text-white'
            )}
            aria-current={published ? undefined : 'true'}
          >
            {t('reputation.notReady')}
          </span>
          <span
            className={cn(
              'flex-1 rounded-full px-3 py-1.5 text-center',
              published ? 'bg-navy-800 font-semibold text-white' : 'text-ink-400'
            )}
            aria-current={published ? 'true' : undefined}
          >
            {t('reputation.ready')}
          </span>
        </div>

        <div className="relative mx-auto mt-2 w-full max-w-[280px]">
          <ReputationGauge ratio={ratio} />
          <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] text-center">
            {published ? (
              <p className="font-display text-4xl leading-none text-navy-800">
                {formatScore(reputation.score as number)}
                <span className="text-lg text-ink-400">/10</span>
              </p>
            ) : (
              <>
                <p className="font-display text-4xl leading-none text-ink-400">—</p>
                <p className="mt-1 text-sm text-ink-500">{t('reputation.gaugeEmpty')}</p>
              </>
            )}
          </div>
        </div>

        <div className="text-center">
          {published ? (
            <>
              <p className="text-sm font-semibold text-navy-800">
                {reputation.grade ? t(`reputation.${reputation.grade}`) : t('reputation.insufficient')}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {t('reputation.updated')}: {updated}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-navy-800">{t('reputation.insufficient')}</p>
              <p className="mt-2 text-sm text-ink-500">
                {t('reputation.shortfall', { orders: missing.orders, reviews: missing.reviews })}
              </p>
              <p className="mt-1 text-sm text-ink-400">
                {t('reputation.need', {
                  orders: reputation.requirements.minOrders,
                  reviews: reputation.requirements.minReviews,
                })}
              </p>
            </>
          )}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          icon={<Star className="h-4 w-4" />}
          title={labels.reviews}
          value={
            reputation.reviews.average == null
              ? t('reputation.cardEmpty')
              : t('reputation.reviewsValue', {
                  score: reputation.reviews.average.toFixed(1),
                  count: reputation.reviews.count,
                })
          }
          empty={reputation.reviews.average == null}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          title={labels.completion}
          value={rateLabel(reputation.completion.percent, t('reputation.cardEmpty'))}
          empty={reputation.completion.percent == null}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          title={labels.onTime}
          value={rateLabel(reputation.onTime.percent, t('reputation.cardEmpty'))}
          empty={reputation.onTime.percent == null}
        />
        <StatCard
          icon={<LifeBuoy className="h-4 w-4" />}
          title={labels.complaints}
          value={rateLabel(reputation.complaints.percent, t('reputation.cardEmpty'))}
          empty={reputation.complaints.percent == null}
        />
      </div>

      <Card hover={false} className="mt-4">
        <h2 className="text-base font-semibold text-navy-800">{t('reputation.detailsTitle')}</h2>
        <p className="mt-1 text-sm text-ink-500">{t('reputation.formula')}</p>
        <div className="mt-4 space-y-4">
          {bars.map((item) => (
            <ProgressRow key={item.label} label={item.label} weight={item.weight} value={item.value} emptyLabel="—" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function bar(label: string, weight: number | undefined, value: number | null) {
  return { label, weight: weightPercent(weight), value };
}

function rateLabel(percent: number | null, empty: string) {
  if (percent == null) return empty;
  return `${formatPercent(percent)}%`;
}

function ReputationGauge({ ratio }: { ratio: number | null }) {
  const { cx, cy, r, stroke } = GAUGE;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const length = Math.PI * r;
  const filled = ratio == null ? 0 : ratio;
  return (
    <svg viewBox="0 0 280 156" className="mx-auto mt-4 w-full max-w-[280px]" aria-hidden>
      <path d={d} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-ink-200" />
      {filled > 0 ? (
        <path
          d={d}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-copper-500"
          strokeDasharray={`${length * filled} ${length}`}
        />
      ) : null}
      <text x={cx - r} y={148} textAnchor="middle" className="fill-ink-400 text-[12px]">
        0
      </text>
      <text x={cx + r} y={148} textAnchor="middle" className="fill-ink-400 text-[12px]">
        10
      </text>
    </svg>
  );
}

function StatCard({
  icon,
  title,
  value,
  empty,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  empty: boolean;
}) {
  return (
    <Card hover={false} className="p-3 md:p-4">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
          {icon}
        </span>
        <p className="min-w-0 pt-1 text-sm leading-5 text-ink-600">{title}</p>
      </div>
      <p className={cn('mt-3 text-base font-semibold leading-6', empty ? 'text-ink-400' : 'text-navy-800')}>{value}</p>
    </Card>
  );
}

function ProgressRow({
  label,
  weight,
  value,
  emptyLabel,
}: {
  label: string;
  weight: number | null;
  value: number | null;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const width = value == null ? 0 : (value / 10) * 100;
  const caption = weight == null ? label : t('reputation.weightLabel', { label, weight });
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-600">{caption}</span>
        <span className={cn('shrink-0 font-semibold', value == null ? 'text-ink-400' : 'text-navy-800')}>
          {value == null ? emptyLabel : t('reputation.componentValue', { score: formatScore(value) })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-100" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={value ?? undefined} aria-label={caption}>
        <div className="h-full rounded-full bg-navy-700" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
