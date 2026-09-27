import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  busy,
  onOpenChange,
  onConfirm,
  children,
}: ConfirmModalProps) {
  const { t } = useI18n();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          variant={tone === 'danger' ? 'outline' : 'copper'}
          className={tone === 'danger' ? 'border-red-200 text-red-700 hover:bg-red-50' : undefined}
          loading={busy}
          onClick={onConfirm}
        >
          {confirmLabel || t('feedback.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
