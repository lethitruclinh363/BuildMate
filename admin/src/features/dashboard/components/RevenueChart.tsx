import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard } from '@/components/GlassCard';
import type { Point } from '@/features/dashboard/types/dashboard.types';

export const RevenueChart = memo(function RevenueChart({ data }: { data: Point[] }) {
  const { t } = useTranslation();
  return (
    <GlassCard className="h-full">
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.revenue')}</p>
      <h3 className="mb-4 font-display text-lg text-white">{t('dash.revenueTitle')}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gPay" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c89445" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#c89445" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: '#111b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }} />
            <Area type="monotone" dataKey="payment" name={t('dash.legendPayment')} stroke="#c89445" fill="url(#gPay)" strokeWidth={2} animationDuration={800} />
            <Area type="monotone" dataKey="commission" name={t('dash.legendCommission')} stroke="#60a5fa" fill="rgba(96,165,250,0.12)" strokeWidth={2} />
            <Area type="monotone" dataKey="earning" name={t('dash.legendEarning')} stroke="#34d399" fill="rgba(52,211,153,0.1)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
});
