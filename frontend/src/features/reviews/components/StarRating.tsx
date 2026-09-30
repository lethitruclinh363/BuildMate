import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

export function StarRating({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className="p-0.5 disabled:cursor-default"
          aria-label={`${n}`}
        >
          <Star
            className={cn('h-6 w-6', n <= value ? 'fill-copper-400 text-copper-400' : 'text-navy-800/20')}
          />
        </button>
      ))}
    </div>
  );
}
