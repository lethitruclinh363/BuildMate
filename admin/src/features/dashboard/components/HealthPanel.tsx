import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/GlassCard';
import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/features/dashboard/types/dashboard.types';

const rows: Array<{ key: keyof Omit<HealthStatus, 'checkedAt'>; label: string }> = [
  { key: 'backend', label: 'health.backend' },
  { key: 'database', label: 'health.database' },
  { key: 'socket', label: 'health.socket' },
  { key: 'storage', label: 'health.storage' },
];

export const HealthPanel = memo(function HealthPanel({ health }: { health: HealthStatus }) {
  const { t } = useTranslation();
  const ok = health.backend === 'ONLINE';
  return (
    <GlassCard>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.monitor')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.platformHealth')}</h3>
      <p className={cn('mb-4 text-sm font-semibold', ok ? 'text-[#166534]' : 'text-[#B91C1C]')}>
        ● {ok ? t('dash.operational') : t('dash.degraded')}
      </p>
      <ul className="space-y-3">
        {rows.map((row) => {
          const value = health[row.key];
          const live = value === 'ONLINE' || value === 'CONNECTED' || value === 'ACTIVE' || value === 'AVAILABLE';
          return (
            <li key={row.key} className="flex items-center justify-between text-sm">
              <span className="text-[#526477]">{t(row.label)}</span>
              <span className={cn('font-semibold', live ? 'text-[#166534]' : 'text-[#92400E]')}>{t(`health.${value}`)}</span>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
});
