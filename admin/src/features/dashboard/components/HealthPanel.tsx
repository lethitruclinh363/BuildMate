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
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.monitor')}</p>
      <h3 className="mb-4 font-display text-lg text-white">{t('dash.platformHealth')}</h3>
      <p className={cn('mb-4 text-sm', ok ? 'text-emerald-300' : 'text-red-300')}>
        ● {ok ? t('dash.operational') : t('dash.degraded')}
      </p>
      <ul className="space-y-3">
        {rows.map((row) => {
          const value = health[row.key];
          const live = value === 'ONLINE' || value === 'CONNECTED' || value === 'ACTIVE' || value === 'AVAILABLE';
          return (
            <li key={row.key} className="flex items-center justify-between text-sm">
              <span className="text-white/60">{t(row.label)}</span>
              <span className={cn('font-semibold', live ? 'text-emerald-300' : 'text-amber-300')}>{t(`health.${value}`)}</span>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
});
