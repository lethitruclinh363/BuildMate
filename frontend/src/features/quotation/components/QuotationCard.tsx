import { Link } from 'react-router-dom';
import { vnd } from '@/lib/partner-api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { labeled, useI18n } from '@/locales';
import type { Quotation } from '@/types/sprint4';

const statusTone: Record<Quotation['status'], 'mist' | 'copper' | 'success' | 'danger' | 'warn'> = {
  DRAFT: 'mist',
  SENT: 'copper',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  MODIFICATION_REQUEST: 'warn',
};

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
  const materials = quote.items.filter((i) => i.type === 'MATERIAL');
  const labor = quote.items.filter((i) => i.type === 'LABOR');

  return (
    <div className="overflow-hidden rounded-[22px] border border-copper-300/70 bg-white/70 shadow-lift backdrop-blur-md">
      <div className="flex items-center justify-between bg-navy-800 px-5 py-3 text-white">
        <p className="font-display text-lg">{t('quote.title')}</p>
        <Badge tone={statusTone[quote.status]}>{labeled(t, 'status', quote.status)}</Badge>
      </div>
      <div className="space-y-4 p-5">
        {materials.length ? (
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-copper-600">{t('quote.materials')}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {materials.map((item) => (
                <li key={`${item.name}-${item.price}`} className="flex justify-between gap-3 text-ink-700">
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
          </div>
        ) : null}
        {labor.length ? (
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-copper-600">{t('quote.labor')}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {labor.map((item) => (
                <li key={`${item.name}-${item.price}`} className="flex justify-between gap-3">
                  <span>{item.name}</span>
                  <span className="font-semibold text-navy-800">{vnd(item.quantity * item.price)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex justify-between text-sm">
          <span className="text-ink-400">{t('quote.transport')}</span>
          <span className="font-semibold text-navy-800">{vnd(quote.transportCost)}</span>
        </div>
        <div className="flex items-end justify-between border-t border-navy-800/10 pt-3">
          <p className="text-sm text-ink-400">{t('quote.timeDays', { n: quote.estimatedDays })}</p>
          <p className="font-display text-2xl text-navy-800">{vnd(quote.totalCost)}</p>
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
