import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { AdminBackButton } from '@/components/AdminBackButton';
import { useAsync } from '@/hooks/useAsync';
import { adminApi } from '@/services/admin.api';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { TextArea } from '@/components/Input';
import { complaintStatusLabel } from '@/lib/utils';
import { getApiErrorMessage } from '@/services/api';
import { useToastStore } from '@/stores/toast.store';
import type { ComplaintStatus } from '@/types/admin';

export function ComplaintDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const push = useToastStore((s) => s.push);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(async () => {
    const items = await adminApi.listComplaints('');
    const row = items.find((item) => item.id === id);
    if (!row) return { row: null, order: null };
    try {
      const order = await adminApi.getOrder(row.orderId);
      return { row, order };
    } catch {
      return { row, order: null };
    }
  }, [id]);

  const row = data?.row;
  const steps = useMemo(() => ['OPEN', 'PROCESSING', 'RESOLVED'] as const, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorState body={error} onRetry={reload} />;
  if (!row) return <ErrorState body={t('pages.notFoundComplaint')} onRetry={reload} />;

  const patch = async (status: ComplaintStatus) => {
    setBusy(true);
    try {
      await adminApi.patchComplaint(row.id, {
        status,
        adminNote: note.trim() || (status === 'PROCESSING' ? t('pages.processingNote') : t('pages.updatedNote')),
      });
      push('success', t('pages.complaintUpdated'));
      await reload();
    } catch (err) {
      push('error', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <AdminBackButton fallback="/complaints" label={t('pages.backComplaints')} />
      <PageHeader eyebrow={t('pages.case')} title={row.reason} description={data?.order?.orderCode} actions={<Badge tone="copper">{complaintStatusLabel(row.status)}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2 space-y-3 text-sm text-white/70">
          <p className="leading-6">{row.description}</p>
          <p>{t('pages.orderLabel')}: {data?.order?.title || row.orderId}</p>
          <p>
            {t('pages.parties')}: {row.createdBy} → {row.againstUser}
          </p>
          {row.adminNote ? <p className="text-copper-300">{row.adminNote}</p> : null}
          <div className="flex gap-2 pt-2">
            {steps.map((step) => (
              <span key={step} className={`rounded-full px-2 py-1 text-[11px] ${row.status === step ? 'bg-copper-500 text-navy-950' : 'bg-white/8'}`}>
                {complaintStatusLabel(step)}
              </span>
            ))}
          </div>
        </GlassCard>
        <GlassCard className="space-y-4">
          <TextArea label={t('pages.adminNote')} value={note} onChange={setNote} />
          <Button className="w-full" variant="outline" loading={busy} onClick={() => void patch('PROCESSING')}>
            {t('pages.process')}
          </Button>
          <Button className="w-full" loading={busy} onClick={() => void patch('RESOLVED')}>
            {t('pages.resolve')}
          </Button>
          <Button className="w-full" variant="danger" loading={busy} onClick={() => void patch('REJECTED')}>
            {t('pages.reject')}
          </Button>
        </GlassCard>
      </div>
    </div>
  );
}
