import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api';
import { te } from '@/locales';
import { orderApi } from '../services/order.api';
import { useOrderLiveStore } from '../store/order-live.store';
import type { Order } from '../types/order.types';

export function useOrders(role: 'customer' | 'contractor') {
  const version = useOrderLiveStore((s) => s.version);
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const req = role === 'customer' ? orderApi.customer() : orderApi.contractor();
    req
      .then((res) => setItems(res.data.data || []))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => {
    load();
  }, [load, version]);

  return { items, loading, error, reload: load };
}
