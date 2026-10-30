import { cn } from '@/lib/cn';

const radii = [3, 5, 10];

export function RadiusSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (km: number) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-white p-1 shadow-card">
      {radii.map((km) => (
        <button
          key={km}
          type="button"
          onClick={() => onChange(km)}
          className={cn(
            'min-h-9 rounded-full px-2.5 py-1 text-xs font-semibold transition sm:px-3 sm:text-sm lg:min-h-8',
            value === km ? 'bg-navy-800 text-white' : 'text-ink-600 hover:bg-paper-100'
          )}
        >
          {km} km
        </button>
      ))}
    </div>
  );
}
