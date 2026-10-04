import { useCallback, useEffect, useRef, useState } from 'react';
import { repairApi, quotationApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { te } from '@/locales';
import type { Quotation, RepairRequest } from '@/types/sprint4';
import { orderApi } from '../services/order.api';
import { useOrderLiveStore } from '../store/order-live.store';
import type { Order, OrderDetail, ProgressUpdate } from '../types/order.types';

export function useOrderDetail(id: string | undefined) {
  const version = useOrderLiveStore((s) => s.version);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [request, setRequest] = useState<RepairRequest | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!id) {
      setLoading(false);
      loadedFor.current = null;
      return;
    }
    const silent = loadedFor.current === id;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    Promise.all([
      orderApi.get(id),
      orderApi.progress(id),
    ])
      .then(async ([orderRes, progressRes]) => {
        const detail = orderRes.data.data;
        setOrder(detail);
        setProgress(progressRes.data.data || []);
        setError(null);
        loadedFor.current = id;
        await Promise.all([
          detail.requestId
            ? repairApi
                .get(detail.requestId)
                .then((res) => setRequest(res.data.data))
                .catch(() => setRequest(null))
            : Promise.resolve(setRequest(null)),
          detail.quotationId
            ? quotationApi
                .get(detail.quotationId)
                .then((res) => setQuotation(res.data.data))
                .catch(() => setQuotation(null))
            : Promise.resolve(setQuotation(null)),
        ]);
      })
      .catch((err) => {
        if (!silent) setError(te(getApiErrorMessage(err)));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const noteProgress = useCallback((update: { order: Order; progress: ProgressUpdate }) => {
    setOrder((prev) => (prev ? { ...prev, status: update.order.status, updatedAt: update.order.updatedAt } : prev));
    setProgress((rows) => (rows.some((row) => row.id === update.progress.id) ? rows : [...rows, update.progress]));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  return { order, progress, request, quotation, loading, error, reload: load, noteProgress };
}
