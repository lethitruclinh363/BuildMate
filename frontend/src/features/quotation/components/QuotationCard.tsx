import { Link } from 'react-router-dom';
import { formatMrlSpec, formatQtyWithUnit } from '@/lib/mrl-display';
import { vnd } from '@/lib/partner-api';
import { Button } from '@/components/ui/Button';
import { labeled, useI18n } from '@/locales';
import type { Quotation } from '@/types/sprint4';

export function QuotationCard({
  quote,
  href,
  compact,
}: {
  quote: Quotation;
  href?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const labor = quote.items.filter((i) => i.type === 'LABOR');
  const pricedMaterials = quote.items.filter((i) => i.type === 'MATERIAL');
  const suggested = (quote.materialList || []).filter((item) => item.name);
  const showSuggested = suggested.length > 0;
  const showPricedMaterials = !showSuggested && pricedMaterials.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-navy-800/10 bg-white">
      <div className="flex items-center justify-between bg-navy-800 px-4 py-3 text-white">
        <p className="font-display text-base">{t('quote.title')}</p>
        <span className="text-xs font-medium text-white/80">{labeled(t, 'status', quote.status)}</span>
      </div>
      <div className="space-y-4 p-4">
        {labor.length ? (
          <section>
            <p className="text-sm font-semibold text-navy-800">{t('quote.labor')}</p>
            <ul className="mt-2 divide-y divide-navy-800/8 text-sm">
              {labor.map((item) => (
                <li key={`labor-${item.name}-${item.price}-${item.quantity}`} className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="font-medium text-ink-800">{item.name}</span>
                    <span className="ml-1.5 text-xs text-ink-400">
                      {t('quote.laborQtyUnit', {
                        qty: item.quantity,
                        unit: item.unit?.toLowerCase() === 'job' ? t('quote.unitDefault') : item.unit || '',
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-navy-800">{vnd(item.quantity * item.price)}</span>
                </li>
              ))}
            </ul>
            {!compact ? (
              <p className="mt-2 text-right text-xs font-semibold text-navy-800">
                {t('quote.labor')}: {vnd(quote.laborCost)}
              </p>
            ) : null}
          </section>
        ) : null}
        {showSuggested ? (
          <section className="border-t border-navy-800/10 pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-navy-800">{t('quote.suggestedMaterials')}</p>
              <p className="text-right text-xs text-ink-400">{t('quote.materialPriceNote')}</p>
            </div>
            <ul className="mt-2 divide-y divide-navy-800/8">
              {suggested.map((item, index) => {
                const spec = formatMrlSpec(item.specification);
                const notes = String(item.notes || '').trim();
                return (
                  <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="font-medium text-ink-800">{item.name}</span>
                      {spec ? <span className="ml-1.5 text-xs text-ink-500">{spec}</span> : null}
                      {notes ? <span className="mt-0.5 block text-xs text-ink-500">{notes}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-ink-600">
                      {formatQtyWithUnit(item.quantity, item.unit)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        {showPricedMaterials ? (
          <section>
            <p className="text-sm font-semibold text-navy-800">{t('quote.materials')}</p>
            <ul className="mt-2 divide-y divide-navy-800/8 text-sm">
              {pricedMaterials.map((item) => (
                <li key={`mat-${item.name}-${item.price}-${item.quantity}`} className="flex justify-between gap-3 py-2 text-ink-700 first:pt-0 last:pb-0">
                  <span>
                    {item.name}
                    <span className="text-ink-400">
                      {' '}
                      · {item.quantity} {item.unit || ''}
                    </span>
                  </span>
                  <span className="font-semibold text-navy-800">{vnd(item.quantity * item.price)}</span>
                </li>
              ))}
            </ul>
            {!compact ? (
              <p className="mt-2 text-right text-xs font-semibold text-navy-800">
                {t('quote.materials')}: {vnd(quote.materialCost)}
              </p>
            ) : null}
          </section>
        ) : null}
        <div className="flex justify-between border-t border-navy-800/8 pt-3 text-sm">
          <span className="text-ink-400">{t('quote.transport')}</span>
          <span className="font-semibold text-navy-800">
            {quote.transportCost === 0 ? t('quote.transportFree') : vnd(quote.transportCost)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-navy-800/10 pt-3">
          <p className="text-sm text-ink-500">{t('quote.timeDays', { n: quote.estimatedDays })}</p>
          <div className="text-right">
            <p className="text-xs font-medium text-ink-400">{t('quote.total')}</p>
            <p className="font-display text-2xl leading-tight text-navy-800">{vnd(quote.totalCost)}</p>
          </div>
        </div>
        {!compact && quote.note ? <p className="text-sm text-ink-600">{quote.note}</p> : null}
        {href ? (
          <Button asChild size="sm" className="w-full">
            <Link to={href}>{t('quote.view')}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
