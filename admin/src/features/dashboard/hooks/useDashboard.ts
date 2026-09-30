import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadDashboardOverview } from '@/features/dashboard/services/dashboard.api';
import type { DashboardOverview } from '@/features/dashboard/types/dashboard.types';
import { getApiErrorMessage } from '@/services/api';

export function useDashboard() {
  const { i18n } = useTranslation();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(async () => {
    try {
      const next = await loadDashboardOverview(false);
      setData(next);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, i18n.language]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const secondsAgo = data ? Math.max(1, Math.round((now - data.refreshedAt) / 1000)) : 0;

  return { data, loading, error, reload, secondsAgo };
}
