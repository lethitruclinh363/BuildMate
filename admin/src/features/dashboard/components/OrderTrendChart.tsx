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
          <p className="text-[11px] uppercase tracking-[0.18em] text-copper-400">{t('dash.trend')}</p>
          <h3 className="font-display text-lg text-white">{t('dash.createdVs')}</h3>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {ranges.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${range === item.id ? 'bg-copper-500 text-navy-950' : 'text-white/55'}`}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series[range]}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#111b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}
            />
            <Line type="monotone" dataKey="created" name={t('dash.legendCreated')} stroke="#c89445" strokeWidth={2.4} dot={false} animationDuration={800} />
            <Line type="monotone" dataKey="completed" name={t('dash.legendCompleted')} stroke="#34d399" strokeWidth={2.4} dot={false} animationDuration={800} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
});

export { OrderTrendChart as OrderChart };
