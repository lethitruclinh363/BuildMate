import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/locales';
import { ReviewForm } from './ReviewForm';

export function ReviewModal({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  onSubmit: (payload: { rating: number; comment: string }) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('review.formTitle')}>
      <ReviewForm title={t('review.serviceTitle')} onSubmit={onSubmit} busy={busy} />
    </Modal>
  );
}
