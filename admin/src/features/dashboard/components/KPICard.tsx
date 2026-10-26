import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CountUp } from '@/features/dashboard/components/CountUp';
import { formatKpi } from '@/features/dashboard/lib/format';
import { cn } from '@/lib/utils';
import type { KpiItem } from '@/features/dashboard/types/dashboard.types';

export const KPICard = memo(function KPICard({ item, icon }: { item: KpiItem; icon: ReactNode }) {
  const { t } = useTranslation();
  const up = item.delta >= 0;
  return (
    <section
      className={cn(
        'glass-card p-4 sm:p-5',
        item.tone === 'danger' && 'border-red-200 bg-red-50/20',
        item.tone === 'success' && 'border-emerald-200 bg-emerald-50/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#526477]">{t(item.label)}</p>
          <p className="mt-1.5 font-display text-2xl lg:text-3xl font-bold text-[#16283C]">
            <CountUp value={item.value} format={(n) => formatKpi(n, item.format)} />
          </p>
          <p className={cn('mt-2 text-xs font-semibold', item.tone === 'danger' ? 'text-red-700' : up ? 'text-emerald-700' : 'text-red-700')}>
            {up ? '+' : ''}
            {item.delta}% <span className="font-normal text-[#7E92A2]">{t(item.hint, { n: item.hintCount ?? 0 })}</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#E1E7ED] bg-[#F8FAFC] p-2.5 text-[#2B6280]">{icon}</div>
      </div>
    </section>
  );
});

export { KPICard as KPIcard };
