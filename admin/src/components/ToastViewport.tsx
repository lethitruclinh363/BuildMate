import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';

export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          className={cn(
            'pointer-events-auto rounded-xl border px-4 py-3 text-left text-sm shadow-glass backdrop-blur-xl',
            item.kind === 'success' && 'border-emerald-500/25 bg-emerald-500/15 text-emerald-100',
            item.kind === 'error' && 'border-red-500/25 bg-red-500/15 text-red-100',
            item.kind === 'warning' && 'border-amber-400/30 bg-amber-500/15 text-amber-100',
            item.kind === 'info' && 'border-white/10 bg-navy-800/90 text-white'
          )}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
}
