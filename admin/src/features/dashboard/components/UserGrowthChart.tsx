import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard } from '@/components/GlassCard';
import type { Point } from '@/features/dashboard/types/dashboard.types';

export const UserGrowthChart = memo(function UserGrowthChart({ data }: { data: Point[] }) {
  const { t } = useTranslation();
  return (
    <GlassCard className="h-full">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.growth')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.growthTitle')}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#E1E7ED" vertical={false} />
            <XAxis dataKey="label" stroke="#526477" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#526477" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E1E7ED', borderRadius: 8, color: '#16283C', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)' }} />
            <Line type="monotone" dataKey="customer" name={t('dash.legendCustomer')} stroke="#2B6280" strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="contractor" name={t('dash.legendContractor')} stroke="#0284C7" strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
});
