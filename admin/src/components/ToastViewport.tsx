import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';
import type { ToastKind } from '@/stores/toast.store';

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

export function ToastViewport() {
  const { t } = useTranslation();
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 text-left',
            item.kind === 'success' && 'border-emerald-200',
            item.kind === 'error' && 'border-red-200',
            item.kind === 'warning' && 'border-amber-300 bg-amber-50',
            item.kind === 'info' && 'border-navy-800/10'
          )}
        >
          {(() => {
            const Icon = icons[item.kind];
            return (
              <>
                <Icon
                  className={cn(
                    'mt-0.5 h-5 w-5 shrink-0',
                    item.kind === 'success' && 'text-emerald-600',
                    item.kind === 'error' && 'text-red-600',
                    item.kind === 'warning' && 'text-amber-700',
                    item.kind === 'info' && 'text-copper-500'
                  )}
                />
                <p
                  className={cn(
                    'min-w-0 flex-1 text-sm font-semibold leading-5',
                    item.kind === 'success' && 'text-emerald-800',
                    item.kind === 'error' && 'text-red-800',
                    item.kind === 'warning' && 'text-amber-900',
                    item.kind === 'info' && 'text-navy-800'
                  )}
                >
                  {item.title}
                </p>
                <button type="button" className="text-ink-400 hover:text-navy-800" onClick={() => dismiss(item.id)} aria-label={t('common.close')}>
                  <X className="h-4 w-4" />
                </button>
              </>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
