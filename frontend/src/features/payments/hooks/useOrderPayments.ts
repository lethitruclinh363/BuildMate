import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api';
import { te } from '@/locales';
import { useOrderLiveStore } from '@/features/orders/store/order-live.store';
import { paymentApi } from '../services/payment.api';
import type { OrderPaymentsPayload } from '../types/payment.types';

export function useOrderPayments(orderId: string | undefined) {
  const version = useOrderLiveStore((s) => s.version);
  const [data, setData] = useState<OrderPaymentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    paymentApi
      .byOrder(orderId)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load, version]);

  return { data, loading, error, reload: load };
}
