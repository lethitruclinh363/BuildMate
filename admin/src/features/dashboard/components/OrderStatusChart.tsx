import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { GlassCard } from '@/components/GlassCard';
import type { StatusSlice } from '@/features/dashboard/types/dashboard.types';

export const OrderStatusChart = memo(function OrderStatusChart({ data }: { data: StatusSlice[] }) {
  const { t } = useTranslation();
  const slices = data.map((slice) => ({ ...slice, label: t(slice.name) }));
  return (
    <GlassCard className="h-full">
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.status')}</p>
      <h3 className="mb-4 font-display text-lg text-white">{t('dash.distribution')}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={52} outerRadius={88} paddingAngle={3} animationDuration={800}>
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: '#111b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/55">
        {slices.map((slice) => (
          <span key={slice.name} className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: slice.fill }} />
            {slice.label}
          </span>
        ))}
      </div>
    </GlassCard>
  );
});
