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
            'rounded-full px-4 py-2 text-sm font-semibold transition',
            value === km ? 'bg-navy-800 text-white' : 'text-ink-600 hover:bg-paper-100'
          )}
        >
          {km} km
        </button>
      ))}
    </div>
  );
}
