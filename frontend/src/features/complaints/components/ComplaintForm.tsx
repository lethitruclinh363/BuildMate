import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { labeled, useI18n } from '@/locales';

const REASONS = ['QUALITY', 'DELAY', 'CONDUCT', 'PAYMENT', 'SAFETY', 'OTHER'] as const;

export function ComplaintForm({
  onSubmit,
  busy,
}: {
  onSubmit: (payload: { reason: string; description: string }) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('QUALITY');
  const [description, setDescription] = useState('');

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ reason, description });
      }}
    >
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-ink-800">{t('complaint.reason')}</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
          className="h-12 w-full rounded-2xl border border-navy-800/10 bg-white/90 px-4 text-sm outline-none focus:border-navy-500 focus:ring-4 focus:ring-navy-500/10"
        >
          {REASONS.map((code) => (
            <option key={code} value={code}>
              {labeled(t, 'complaintReason', code)}
            </option>
          ))}
        </select>
      </label>
      <TextArea
        label={t('complaint.description')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        minLength={10}
        required
      />
      <Button type="submit" variant="copper" loading={busy} className="w-full">
        {t('complaint.submit')}
      </Button>
    </form>
  );
}
