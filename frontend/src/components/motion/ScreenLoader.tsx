import { Loader2 } from 'lucide-react';
import { useI18n } from '@/locales';

export function ScreenLoader() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen place-items-center bg-paper-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-navy-800" />
        <p className="text-sm text-ink-400">{t('common.loading')}</p>
      </div>
    </div>
  );
}
