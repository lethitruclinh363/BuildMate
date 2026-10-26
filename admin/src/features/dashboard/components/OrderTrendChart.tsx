import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GlassCard } from '@/components/GlassCard';
import type { Point, TrendRange } from '@/features/dashboard/types/dashboard.types';

const ranges: Array<{ id: TrendRange; label: string }> = [
  { id: '7d', label: 'time.days7' },
  { id: '30d', label: 'time.days30' },
  { id: '12m', label: 'time.months12' },
];

export const OrderTrendChart = memo(function OrderTrendChart({ series }: { series: Record<TrendRange, Point[]> }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>('7d');
  return (
    <GlassCard className="h-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2B6280]">{t('dash.trend')}</p>
          <h3 className="font-display text-lg font-bold text-[#16283C]">{t('dash.createdVs')}</h3>
        </div>
        <div className="flex gap-1 rounded-lg border border-[#E1E7ED] bg-[#F8FAFC] p-1">
          {ranges.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                range === item.id ? 'bg-[#173B4F] text-white shadow-sm' : 'text-[#526477] hover:text-[#16283C]'
              }`}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series[range]}>
            <CartesianGrid stroke="#E1E7ED" vertical={false} />
            <XAxis dataKey="label" stroke="#526477" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#526477" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E1E7ED', borderRadius: 8, color: '#16283C', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)' }}
            />
            <Line type="monotone" dataKey="created" name={t('dash.legendCreated')} stroke="#2B6280" strokeWidth={2.4} dot={false} animationDuration={800} />
            <Line type="monotone" dataKey="completed" name={t('dash.legendCompleted')} stroke="#16A34A" strokeWidth={2.4} dot={false} animationDuration={800} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
});

export { OrderTrendChart as OrderChart };
