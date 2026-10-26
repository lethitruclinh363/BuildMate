import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/auth/auth.store';
import { greeting } from '@/features/dashboard/lib/format';
import type { HealthStatus } from '@/features/dashboard/types/dashboard.types';

export const HeroHeader = memo(function HeroHeader({
  secondsAgo,
  health,
}: {
  secondsAgo: number;
  health: HealthStatus;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const ok = health.backend === 'ONLINE';
  const initial = (user?.name || 'A').slice(0, 1).toUpperCase();

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2B6280]">{t('dash.control')}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-[#16283C] sm:text-3xl">
          {greeting()}, {user?.name?.split(' ')[0] || t('roles.ADMIN')}
        </h1>
        <p className="mt-1 text-sm text-[#526477]">{t('dash.overview')}</p>
        <p className="mt-2 text-xs text-[#7E92A2]">{t('time.updated', { n: secondsAgo })}</p>
      </div>
      <div className="flex items-center gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#526477]">{t('dash.health')}</p>
          <p className={`mt-1 text-sm font-semibold ${ok ? 'text-[#166534]' : 'text-[#B91C1C]'}`}>
            ● {ok ? t('dash.operational') : t('dash.interrupted')}
          </p>
        </div>
        <div className="relative">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#173B4F] font-display text-lg font-bold text-white shadow-sm">
            {initial}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
        </div>
      </div>
    </motion.section>
  );
});
