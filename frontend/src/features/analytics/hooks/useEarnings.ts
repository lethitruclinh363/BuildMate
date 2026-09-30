import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api';
import { te } from '@/locales';
import { earningsApi } from '@/features/payments/services/payment.api';
import type { EarningsPayload } from '@/features/payments/types/payment.types';

export function useEarnings() {
  const [data, setData] = useState<EarningsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    earningsApi
      .mine()
      .then((res) => setData(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
