import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

export function ExploreCategorySelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { category: string; label: string }[];
  onChange: (category: string) => void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.category === value);
  const label = selected?.label || t('explore.allCategories');

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  return (
    <div ref={rootRef} className="relative w-[170px] shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-navy-800/15 bg-white px-3 text-left text-sm text-navy-800"
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-72 w-full min-w-[170px] overflow-auto rounded-lg border border-navy-800/10 bg-white py-1 shadow-card"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={cn('flex w-full px-3 py-2 text-left text-sm', !value ? 'bg-paper-100 font-semibold text-navy-800' : 'text-ink-600 hover:bg-paper-100')}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {t('explore.allCategories')}
            </button>
          </li>
          {options.map((item) => (
            <li key={item.category}>
              <button
                type="button"
                role="option"
                aria-selected={value === item.category}
                className={cn(
                  'flex w-full px-3 py-2 text-left text-sm',
                  value === item.category ? 'bg-paper-100 font-semibold text-navy-800' : 'text-ink-600 hover:bg-paper-100'
                )}
                onClick={() => {
                  onChange(item.category);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
