import type { ReputationSnapshot } from '../types/reputation.types';

export function ReputationSummary({
  reputation,
  t,
}: {
  reputation: ReputationSnapshot;
  t: (path: string, vars?: Record<string, string | number>) => string;
}) {
  if (!reputation.published || reputation.score == null) {
    return <p className="text-sm font-semibold text-navy-800">{t('reputation.insufficient')}</p>;
  }

  const reviewLine = reputation.reviews.average == null
    ? t('reputation.noAverage')
    : t('reputation.publicReviews', {
        score: reputation.reviews.average.toFixed(1),
        count: reputation.reviews.count,
      });
  const completionLine = reputation.completion.percent == null
    ? t('reputation.metricInsufficient')
    : t('reputation.publicCompletion', { percent: formatPercent(reputation.completion.percent) });

  return (
    <div className="space-y-1 text-sm text-navy-800">
      <p className="font-semibold">
        {t('reputation.scoreLabel')} {reputation.score.toFixed(2)}/10
      </p>
      {reputation.grade ? (
        <p>
          {t('reputation.grade')}: {t(`reputation.${reputation.grade}`)}
        </p>
      ) : null}
      <p>{reviewLine}</p>
      <p>{completionLine}</p>
    </div>
  );
}

export function formatPercent(value: number) {
  const text = value.toFixed(2);
  return text.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}
