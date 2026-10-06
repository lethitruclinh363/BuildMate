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
        'glass-card p-4',
        item.tone === 'danger' && 'border-red-400/25',
        item.tone === 'success' && 'border-emerald-400/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-copper-400">{t(item.label)}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">
            <CountUp value={item.value} format={(n) => formatKpi(n, item.format)} />
          </p>
          <p className={cn('mt-2 text-xs font-semibold', item.tone === 'danger' ? 'text-red-300' : up ? 'text-emerald-300' : 'text-red-300')}>
            {up ? '+' : ''}
            {item.delta}% <span className="font-normal text-white/40">{t(item.hint, { n: item.hintCount ?? 0 })}</span>
          </p>
        </div>
        <div className="rounded-xl border border-copper-500/25 bg-copper-500/10 p-2.5 text-copper-400">{icon}</div>
      </div>
    </section>
  );
});

export { KPICard as KPIcard };
