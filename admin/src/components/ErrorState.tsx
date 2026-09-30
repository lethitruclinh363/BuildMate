import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';

export function ErrorState({ body, onRetry }: { body?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <GlassCard className="mx-auto max-w-lg text-center">
      <p className="text-sm font-semibold text-red-300">{t('errors.failed')}</p>
      <p className="mt-2 text-sm text-white/60">{body || t('errors.unexpected')}</p>
      {onRetry ? (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          {t('errors.retry')}
        </Button>
      ) : null}
    </GlassCard>
  );
}
