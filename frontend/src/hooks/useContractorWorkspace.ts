import { useCallback, useEffect, useState } from 'react';
import { contractorApi } from '@/lib/partner-api';
import type { WorkspacePayload } from '@/types/partner';

export function useContractorWorkspace() {
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await contractorApi.workspace();
      setData(res.data.data);
    } catch {
      setError('Could not load partner workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    approved: data?.profile.verificationStatus === 'APPROVED',
  };
}
