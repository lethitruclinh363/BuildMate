import { ClipboardList, Wallet } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageTransition } from '@/components/motion/PageTransition';
import { useI18n } from '@/locales';

export function StoreOrdersPage() {
  const { t } = useI18n();
  return (
    <PageTransition>
      <PageHeader eyebrow={t('nav.store.orders')} title={t('materialPage.ordersTitle')} description={t('materialPage.ordersBody')} />
      <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t('materialPage.ordersEmpty')} body={t('materialPage.ordersBody')} />
    </PageTransition>
  );
}

export function StoreEarningsPage() {
  const { t } = useI18n();
  return (
    <PageTransition>
      <PageHeader eyebrow={t('nav.store.earnings')} title={t('materialPage.earningsTitle')} description={t('materialPage.earningsBody')} />
      <EmptyState icon={<Wallet className="h-6 w-6" />} title={t('materialPage.earningsEmpty')} body={t('materialPage.earningsBody')} />
    </PageTransition>
  );
}
