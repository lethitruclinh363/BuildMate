import { useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '@/components/feedback/ConfirmModal';
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
  const [status, setStatus] = useState<ProgressStatus>(options[0] || 'IN_PROGRESS');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = options.includes(status) ? status : options[0];

  useEffect(() => {
    const next = allowedProgressStatuses(currentStatus);
    setStatus(next[0] || 'IN_PROGRESS');
  }, [currentStatus]);

  if (!options.length || !selected) return null;

  const fromLabel = labeled(t, 'orders.status', currentStatus);
  const toLabel = labeled(t, 'orders.progressStatus', selected);

  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setConfirmOpen(true);
        }}
      >
        <Select
          id="progress-status"
          name="status"
          label={t('orders.progress.fieldStatus')}
          value={selected}
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
      <ConfirmModal
        open={confirmOpen}
        title={t('orders.progress.confirmTitle')}
        description={t('orders.progress.confirmBody', { from: fromLabel, to: toLabel })}
        busy={busy}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
        onConfirm={() => {
          if (busy) return;
          void onSubmit({ status: selected, description, images })
            .then(() => {
              setDescription('');
              setImages([]);
              if (fileRef.current) fileRef.current.value = '';
              setConfirmOpen(false);
            })
            .catch(() => undefined);
        }}
      />
    </>
  );
}
