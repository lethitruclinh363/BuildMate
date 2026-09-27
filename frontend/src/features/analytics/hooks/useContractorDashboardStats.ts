import { useCallback, useEffect, useState } from 'react';
import { contractorApi } from '@/lib/partner-api';
import { getApiErrorMessage } from '@/lib/api';
import { te } from '@/locales';
import type { ContractorDashboardStats } from '../types/dashboard-stats';

export function useContractorDashboardStats() {
  const [data, setData] = useState<ContractorDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    contractorApi
      .dashboardStats()
      .then((res) => setData(res.data.data))
      .catch((err) => {
        setData(null);
        setError(te(getApiErrorMessage(err)));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
