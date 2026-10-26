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
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.activity')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.stream')}</h3>
      <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border border-[#E1E7ED] bg-[#F8FAFC] px-3.5 py-3 transition-colors hover:bg-[#F1F5F9]"
            >
              <p className="text-sm font-semibold text-[#16283C]">
                {emoji[item.tone]} {i18n.exists(item.title) ? t(item.title) : item.title}
              </p>
              <p className="mt-1 text-xs text-[#526477]">
                {item.body} · {relativeTime(item.at)}
              </p>
            </motion.li>
          ))}
        </AnimatePresence>
        {items.length === 0 ? <p className="text-center text-sm text-[#7E92A2]">{t('dash.waiting')}</p> : null}
      </ul>
    </GlassCard>
  );
});

export { LiveActivityFeed as ActivityFeed };
