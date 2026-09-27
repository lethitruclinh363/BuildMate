import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '@/components/GlassCard';
import { relativeTime } from '@/features/dashboard/lib/format';
import type { ActivityItem } from '@/features/dashboard/types/dashboard.types';

const emoji: Record<ActivityItem['tone'], string> = {
  success: '🟢',
  money: '💰',
  star: '⭐',
  warn: '⚠',
  info: '●',
};

export const LiveActivityFeed = memo(function LiveActivityFeed({ items }: { items: ActivityItem[] }) {
  const { t, i18n } = useTranslation();
  return (
    <GlassCard className="h-full">
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.activity')}</p>
      <h3 className="mb-4 font-display text-lg text-white">{t('dash.stream')}</h3>
      <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-white/6 bg-white/[0.03] px-3 py-3"
            >
              <p className="text-sm text-white">
                {emoji[item.tone]} {i18n.exists(item.title) ? t(item.title) : item.title}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {item.body} · {relativeTime(item.at)}
              </p>
            </motion.li>
          ))}
        </AnimatePresence>
        {items.length === 0 ? <p className="text-sm text-white/40">{t('dash.waiting')}</p> : null}
      </ul>
    </GlassCard>
  );
});

export { LiveActivityFeed as ActivityFeed };
