import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/locales';

interface ErrorStateProps {
  title?: string;
  body?: string;
  pending?: boolean;
  onRetry?: () => void;
}

export function ErrorState({ title, body, pending, onRetry }: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div className="grid place-items-center rounded-[22px] border border-red-100 bg-white px-6 py-16 text-center shadow-card">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display text-2xl text-navy-800">{title || t('feedback.errorTitle')}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-400">{body || t('feedback.errorBody')}</p>
      {onRetry ? (
        <Button className="mt-6" variant="outline" loading={pending} onClick={onRetry}>
          {t('feedback.retry')}
        </Button>
      ) : null}
    </div>
  );
}
