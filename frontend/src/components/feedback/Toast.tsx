import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToastStore, type ToastKind } from '@/store/toast.store';

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(92vw,360px)] flex-col gap-2">
      <AnimatePresence>
        {items.map((item) => {
          const Icon = icons[item.kind];
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4',
                item.kind === 'error' && 'border-red-100',
                item.kind === 'success' && 'border-emerald-100',
                item.kind === 'info' && 'border-navy-800/10'
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  item.kind === 'error' && 'text-red-600',
                  item.kind === 'success' && 'text-emerald-600',
                  item.kind === 'info' && 'text-copper-500'
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-800">{item.title}</p>
                {item.body ? <p className="mt-1 text-xs text-ink-400">{item.body}</p> : null}
              </div>
              <button type="button" className="text-ink-400 hover:text-navy-800" onClick={() => dismiss(item.id)}>
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
