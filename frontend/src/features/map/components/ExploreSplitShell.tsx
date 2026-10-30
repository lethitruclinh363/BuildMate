import type { ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';

export function ExploreSplitShell({
  list,
  map,
  listRef,
  className,
  mobilePane = 'map',
}: {
  list: ReactNode;
  map: ReactNode;
  listRef?: Ref<HTMLDivElement>;
  className?: string;
  mobilePane?: 'map' | 'list';
}) {
  return (
    <div className={cn('explore-split relative flex min-h-0 flex-1 overflow-hidden lg:flex-row lg:gap-2', className)}>
      <aside
        className={cn(
          'min-h-0 min-w-0 flex-col overflow-hidden bg-paper-100',
          'max-lg:absolute max-lg:inset-0 max-lg:z-20',
          mobilePane === 'list' ? 'flex' : 'hidden',
          'lg:relative lg:z-auto lg:flex lg:w-[29%] lg:shrink-0 lg:flex-none lg:bg-transparent'
        )}
      >
        <div ref={listRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-1">
          {list}
        </div>
      </aside>
      <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[12px] border border-navy-800/8 shadow-card">
        {map}
      </section>
    </div>
  );
}
