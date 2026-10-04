import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { Quotation, RepairRequest } from '@/types/sprint4';
import { SiteLocationCard } from '@/features/map/components/SiteLocationCard';
import { placeFromRecord } from '@/features/map/lib/location';
import { ProgressGallery } from '@/features/progress/components/ProgressGallery';
import type { OrderDetail, ProgressUpdate } from '../types/order.types';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderTimeline } from './OrderTimeline';

interface OrderDetailViewProps {
  order: OrderDetail;
  progress: ProgressUpdate[];
  request?: RepairRequest | null;
  quotation?: Quotation | null;
  actions?: ReactNode;
  /** Customer view uses customer status labels. */
  customerView?: boolean;
}

export function OrderDetailView({ order, progress, request, quotation, actions, customerView }: OrderDetailViewProps) {
  const { t } = useI18n();
  const party = request?.contractor?.name || request?.customer?.name;
  const place = request?.address || request?.store?.address || t('orders.siteFallback');
  const site = placeFromRecord(request);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-wide text-copper-600">{order.orderCode || ''}</p>
          <h1 className="mt-1 font-display text-3xl text-navy-800">{order.title}</h1>
        </div>
        <OrderStatusBadge status={order.status} customerView={customerView} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card hover={false} className="lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.18em] text-copper-500">{t('orders.detail.info')}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-400">{t('orders.detail.party')}</dt>
              <dd className="font-medium text-navy-800">{party || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">{t('orders.detail.store')}</dt>
              <dd className="font-medium text-navy-800">{request?.store?.name || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-400">{t('orders.detail.location')}</dt>
              <dd className="flex items-start gap-2 font-medium text-navy-800">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-copper-500" />
                {place}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">{t('orders.detail.amount')}</dt>
              <dd className="font-display text-2xl text-navy-800">{vnd(order.amount ?? 0)}</dd>
            </div>
          </dl>
          {order.description ? <p className="mt-4 text-sm leading-6 text-ink-600">{order.description}</p> : null}
          {site ? (
            <div className="mt-5">
              <SiteLocationCard title={t('orders.detail.siteTitle')} place={site} />
            </div>
          ) : null}
        </Card>
        <Card hover={false}>
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-copper-500">{t('orders.detail.timeline')}</p>
          <OrderTimeline status={order.status} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {quotation ? (
            <Card hover={false}>
              <p className="text-xs uppercase tracking-[0.18em] text-copper-500">{t('orders.detail.quote')}</p>
              <p className="mt-2 text-sm text-ink-600">
                {t('quote.materials')}: {vnd(quotation.materialCost)} · {t('quote.labor')}: {vnd(quotation.laborCost)} ·{' '}
                {t('quote.transport')}: {vnd(quotation.transportCost)}
              </p>
            </Card>
          ) : null}
          <Card hover={false}>
            <p className="mb-4 text-xs uppercase tracking-[0.18em] text-copper-500">{t('orders.progress.title')}</p>
            <ProgressGallery items={progress} />
          </Card>
        </div>
        <div className="space-y-6">
          {actions}
        </div>
      </div>
    </div>
  );
}
