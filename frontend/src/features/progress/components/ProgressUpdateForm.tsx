import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { allowedProgressStatuses } from '@/features/orders/types/orderStatus';
import type { OrderStatus, ProgressStatus } from '@/features/orders/types/order.types';
import { labeled, useI18n } from '@/locales';

interface ProgressUpdateFormProps {
  currentStatus: OrderStatus;
  busy?: boolean;
  onSubmit: (payload: { status: ProgressStatus; description: string; images: File[] }) => Promise<void>;
}

export function ProgressUpdateForm({ currentStatus, busy, onSubmit }: ProgressUpdateFormProps) {
  const { t } = useI18n();
  const options = allowedProgressStatuses(currentStatus);
  const [status, setStatus] = useState<ProgressStatus>(options[0] || 'STARTED');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = allowedProgressStatuses(currentStatus);
    setStatus((prev) => (next.includes(prev) ? prev : next[0] || 'STARTED'));
  }, [currentStatus]);

  if (!options.length) return null;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const selected = options.includes(status) ? status : options[0];
        void onSubmit({ status: selected, description, images }).then(() => {
          setDescription('');
          setImages([]);
          if (fileRef.current) fileRef.current.value = '';
        }).catch(() => undefined);
      }}
    >
      <Select
        id="progress-status"
        name="status"
        label={t('orders.progress.fieldStatus')}
        value={options.includes(status) ? status : options[0]}
        onChange={(e) => setStatus(e.target.value as ProgressStatus)}
      >
        {options.map((code) => (
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
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-full file:border-0 file:bg-navy-800 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-paper-50"
          onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 6))}
        />
        {images.length ? <p className="text-xs text-ink-400">{t('orders.progress.fileCount', { n: images.length })}</p> : null}
      </label>
      <Button type="submit" loading={busy} className="w-full sm:w-auto" disabled={busy || (!description.trim() && !images.length)}>
        {t('orders.progress.submit')}
      </Button>
    </form>
  );
}
