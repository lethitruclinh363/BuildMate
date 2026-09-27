import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard } from '@/components/GlassCard';
import type { Point } from '@/features/dashboard/types/dashboard.types';

export const UserGrowthChart = memo(function UserGrowthChart({ data }: { data: Point[] }) {
  const { t } = useTranslation();
  return (
    <GlassCard className="h-full">
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.growth')}</p>
      <h3 className="mb-4 font-display text-lg text-white">{t('dash.growthTitle')}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#111b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} />
            <Line type="monotone" dataKey="customer" name={t('dash.legendCustomer')} stroke="#c89445" strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="contractor" name={t('dash.legendContractor')} stroke="#60a5fa" strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
});
