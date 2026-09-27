import { memo } from 'react';
import { ClipboardList } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/locales';
import type { MonthOrderPoint } from '../types/dashboard-stats';

export const ContractorOrderTrendChart = memo(function ContractorOrderTrendChart({
  data,
}: {
  data: MonthOrderPoint[];
}) {
  const { t } = useI18n();
  const hasSignal = data.some((row) => row.count > 0);

  return (
    <Card hover={false} className="h-full">
      <p className="text-[11px] uppercase tracking-[0.18em] text-copper-500">{t('contractorHome.chartOrders')}</p>
      <h3 className="mt-1 font-display text-lg text-navy-800">{t('contractorHome.chartOrdersTitle')}</h3>
      {!hasSignal ? (
        <div className="mt-4">
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title={t('contractorHome.chartEmpty')}
            body={t('contractorHome.chartEmptyBody')}
          />
        </div>
      ) : (
        <div className="mt-4 h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(11,46,74,0.08)" vertical={false} />
              <XAxis dataKey="month" stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} stroke="#7a8499" fontSize={11} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{
                  background: '#0B2E4A',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                }}
              />
              <Bar dataKey="count" name={t('contractorHome.chartOrderCount')} fill="#0B2E4A" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
});
