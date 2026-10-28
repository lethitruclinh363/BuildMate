import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard } from '@/components/GlassCard';
import { chartHasValues, formatKpi } from '@/features/dashboard/lib/format';
import type { Point } from '@/features/dashboard/types/dashboard.types';

export const RevenueChart = memo(function RevenueChart({ data }: { data: Point[] }) {
  const { t } = useTranslation();
  return (
    <GlassCard className="h-full">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.revenue')}</p>
      <h3 className="mb-4 font-display text-lg font-bold text-[#16283C]">{t('dash.revenueTitle')}</h3>
      <div className="h-64">
        {!chartHasValues(data || [], ['payment', 'commission', 'earning']) ? (
          <p className="flex h-full items-center justify-center text-sm text-[#526477]">{t('dash.noChartData')}</p>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="gPay" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2B6280" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2B6280" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E1E7ED" vertical={false} />
            <XAxis dataKey="label" stroke="#526477" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#526477" fontSize={11} tickLine={false} axisLine={false} width={72} tickFormatter={(value) => formatKpi(Number(value) || 0, 'compact')} />
            <Tooltip
              formatter={(value: any) => formatKpi(Number(value) || 0, 'compact')}
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E1E7ED', borderRadius: 8, color: '#16283C', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)' }}
            />
            <Area type="monotone" dataKey="payment" name={t('dash.legendPayment')} stroke="#2B6280" fill="url(#gPay)" strokeWidth={2} animationDuration={800} />
            <Area type="monotone" dataKey="commission" name={t('dash.legendCommission')} stroke="#0284C7" fill="rgba(2,132,199,0.12)" strokeWidth={2} />
            <Area type="monotone" dataKey="earning" name={t('dash.legendEarning')} stroke="#16A34A" fill="rgba(22,163,74,0.1)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </GlassCard>
  );
});
