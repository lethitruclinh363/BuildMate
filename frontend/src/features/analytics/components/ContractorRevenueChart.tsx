import { memo } from 'react';
import { Wallet } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Card } from '@/components/ui/Card';
import { vnd } from '@/lib/partner-api';
import { useI18n } from '@/locales';
import type { MonthRevenuePoint } from '../types/dashboard-stats';

export const ContractorRevenueChart = memo(function ContractorRevenueChart({
  data,
}: {
  data: MonthRevenuePoint[];
}) {
  const { t } = useI18n();
  const hasSignal = data.some((row) => row.net > 0 || row.gross > 0);

  return (
    <Card hover={false} className="h-full">
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-500">{t('contractorHome.chartRevenue')}</p>
      <h3 className="mt-1 font-display text-lg text-navy-800">{t('contractorHome.chartRevenueTitle')}</h3>
      {!hasSignal ? (
        <div className="mt-4">
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title={t('contractorHome.chartEmpty')}
            body={t('contractorHome.chartEmptyBody')}
          />
        </div>
      ) : (
        <div className="mt-4 h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="bmNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E87722" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#E87722" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(11,46,74,0.08)" vertical={false} />
              <XAxis dataKey="month" stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} width={56} />
              <Tooltip
                formatter={(value: number) => vnd(value)}
                contentStyle={{
                  background: '#0B2E4A',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey="net"
                name={t('contractorHome.chartNet')}
                stroke="#E87722"
                fill="url(#bmNet)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
});
