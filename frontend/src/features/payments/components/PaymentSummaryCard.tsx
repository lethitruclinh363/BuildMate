import { Card } from '@/components/ui/Card';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import type { OrderPaymentsPayload } from '../types/payment.types';

export function PaymentSummaryCard({
  summary,
  orderCode,
  title,
  contractor,
}: {
  summary: OrderPaymentsPayload['summary'];
  orderCode: string;
  title: string;
  contractor?: string;
}) {
  const { t } = useI18n();
  return (
    <Card hover={false}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-copper-600">{orderCode}</p>
          <h2 className="mt-1 font-display text-2xl text-navy-800">{title}</h2>
          {contractor ? <p className="mt-1 text-sm text-ink-500">{t('pay.contractor')}: {contractor}</p> : null}
        </div>
        <PaymentStatusBadge status={summary.status} />
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-400">{t('pay.total')}</dt>
          <dd className="font-display text-2xl text-navy-800">{vnd(summary.amount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">{t('pay.paid')}</dt>
          <dd className="font-display text-2xl text-navy-800">{vnd(summary.paidAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">{t('pay.due')}</dt>
          <dd className="font-display text-2xl text-copper-600">{vnd(summary.remainingAmount)}</dd>
        </div>
      </dl>
    </Card>
  );
}
