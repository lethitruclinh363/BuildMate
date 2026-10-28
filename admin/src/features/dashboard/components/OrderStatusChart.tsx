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
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.status')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.distribution')}</h3>
      {!slices.length ? (
        <p className="flex h-64 items-center justify-center text-sm text-[#526477]">{t('dash.noStatusData')}</p>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius={52} outerRadius={88} paddingAngle={3} animationDuration={800}>
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E1E7ED', borderRadius: 8, color: '#16283C', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#526477]">
            {slices.map((slice) => (
              <span key={slice.name} className="flex items-center gap-1.5 font-medium">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: slice.fill }} />
                {slice.label}
              </span>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
});
