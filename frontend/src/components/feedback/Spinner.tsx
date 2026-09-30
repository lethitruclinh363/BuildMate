import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-navy-800', className)} role="status">
      <Loader2 className="h-8 w-8 animate-spin text-copper-500" aria-hidden />
      <p className="text-sm text-ink-400">{label || t('common.loading')}</p>
    </div>
  );
}
