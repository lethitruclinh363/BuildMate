import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api';
import { te } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { reviewApi } from '../services/review.api';
import type { ReviewListPayload, ReviewTargetType } from '../types/review.types';

export function useUserReviews(userId: string | undefined, targetType?: ReviewTargetType) {
  const version = useAuthStore((s) => s.user?.id);
  const [data, setData] = useState<ReviewListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    reviewApi
      .forUser(userId, targetType)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  }, [userId, targetType, version]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
