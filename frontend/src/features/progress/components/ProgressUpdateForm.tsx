import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { labeled, useI18n } from '@/locales';
import type { ProgressStatus } from '@/features/orders/types/order.types';

const STATUSES: ProgressStatus[] = ['STARTED', 'IN_PROGRESS', 'COMPLETED'];

interface ProgressUpdateFormProps {
  busy?: boolean;
  onSubmit: (payload: { status: ProgressStatus; description: string; images: File[] }) => Promise<void>;
}

export function ProgressUpdateForm({ busy, onSubmit }: ProgressUpdateFormProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ProgressStatus>('STARTED');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ status, description, images }).then(() => {
          setDescription('');
          setImages([]);
        }).catch(() => undefined);
      }}
    >
      <Select
        id="progress-status"
        label={t('orders.progress.fieldStatus')}
        value={status}
        onChange={(e) => setStatus(e.target.value as ProgressStatus)}
      >
        {STATUSES.map((code) => (
          <option key={code} value={code}>
            {labeled(t, 'orders.progressStatus', code)}
          </option>
        ))}
      </Select>
      <TextArea
        id="progress-note"
        label={t('orders.progress.fieldNote')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('orders.progress.notePh')}
      />
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-ink-800">{t('orders.progress.fieldPhotos')}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-full file:border-0 file:bg-navy-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-paper-50"
          onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 6))}
        />
        {images.length ? <p className="text-xs text-ink-400">{t('orders.progress.fileCount', { n: images.length })}</p> : null}
      </label>
      <Button type="submit" loading={busy} className="w-full sm:w-auto" disabled={!description.trim() && !images.length}>
        {t('orders.progress.submit')}
      </Button>
    </form>
  );
}
