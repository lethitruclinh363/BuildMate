import { useMemo } from 'react';
import { DashboardShell } from './DashboardShell';
import { contractorNav } from './roleNav';
import { useI18n } from '@/locales';

export function ContractorLayout() {
  const { t } = useI18n();
  const items = useMemo(() => contractorNav(t), [t]);
  return <DashboardShell variant="contractor" items={items} />;
}
